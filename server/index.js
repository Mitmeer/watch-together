import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  createRoom,
  getRoom,
  deleteRoomIfEmpty,
  getRoomState,
  addChatMessage,
  updatePlayback,
  transferHost,
  isRoomHost,
} from './rooms.js';
import { extractVideoInfo, refreshStreamUrl } from './videoExtractor.js';
import { cacheVideo, getCachedVideo, updateStreamUrl, toClientVideo } from './videoStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('trust proxy', 1);
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: isProd ? 'production' : 'development' });
});

async function prepareVideo(url) {
  const info = await extractVideoInfo(url);
  const videoId = cacheVideo(info);
  const entry = getCachedVideo(videoId);
  return toClientVideo(entry);
}

app.post('/api/video/extract', async (req, res) => {
  try {
    const video = await prepareVideo(req.body?.url);
    res.json(video);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Ошибка извлечения видео' });
  }
});

app.get('/api/video/stream/:id', async (req, res) => {
  let entry = getCachedVideo(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Видео не найдено или истекло. Загрузите ссылку снова.' });
  }

  const fetchStream = async (streamUrl) =>
    fetch(streamUrl, {
      headers: {
        Range: req.headers.range || '',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: entry.webpageUrl || '',
        Origin: new URL(entry.webpageUrl || 'https://www.youtube.com').origin,
      },
    });

  try {
    let response = await fetchStream(entry.streamUrl);

    if ((!response.ok && response.status !== 206) || response.status === 403) {
      if (entry.webpageUrl && entry.extractor !== 'direct') {
        const freshUrl = await refreshStreamUrl(entry.webpageUrl);
        entry = updateStreamUrl(entry.id, freshUrl);
        response = await fetchStream(entry.streamUrl);
      }
    }

    if (!response.ok && response.status !== 206) {
      return res.status(502).json({ error: 'Не удалось загрузить видео. Попробуйте другую ссылку.' });
    }

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    res.status(response.status);
    res.setHeader('Accept-Ranges', 'bytes');

    if (response.body) {
      const { Readable } = await import('stream');
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.send(Buffer.from(await response.arrayBuffer()));
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Ошибка воспроизведения' });
  }
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');

if (isProd) {
  app.use(express.static(clientDist, { maxAge: '1d' }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
}

io.on('connection', (socket) => {
  let userName = 'Гость';

  const getSocketRoom = () => {
    if (socket.data.roomCode) {
      return getRoom(socket.data.roomCode);
    }
    const roomCode = [...socket.rooms].find((r) => r !== socket.id);
    return roomCode ? getRoom(roomCode) : null;
  };

  socket.on('create-room', ({ name, clientUserId }, callback) => {
    userName = (name || 'Хост').slice(0, 24);
    const room = createRoom(socket.id, clientUserId, userName);
    socket.data.roomCode = room.code;
    socket.join(room.code);
    callback?.({ success: true, room: getRoomState(room) });
    io.to(room.code).emit('room-updated', getRoomState(room));
  });

  socket.on('join-room', ({ code, name, clientUserId }, callback) => {
    const room = getRoom(code);
    if (!room) {
      callback?.({ success: false, error: 'Комната не найдена. Проверьте код.' });
      return;
    }

    userName = (name || 'Гость').slice(0, 24);
    const isHost = isRoomHost(room, socket.id, clientUserId);

    if (isHost) {
      room.hostSocketId = socket.id;
    }

    room.users.set(socket.id, {
      id: socket.id,
      clientUserId,
      name: userName,
      isHost,
    });
    socket.data.roomCode = room.code;
    socket.join(room.code);

    callback?.({ success: true, room: getRoomState(room) });
    io.to(room.code).emit('room-updated', getRoomState(room));
  });

  socket.on('set-video', async ({ url }, callback) => {
    const room = getSocketRoom();
    if (!room) {
      callback?.({ success: false, error: 'Сначала войдите в комнату' });
      return;
    }
    if (room.hostSocketId !== socket.id) {
      callback?.({ success: false, error: 'Только хост может менять видео' });
      return;
    }
    if (!url?.trim()) {
      callback?.({ success: false, error: 'Вставьте ссылку на видео' });
      return;
    }

    try {
      const video = await prepareVideo(url.trim());
      updatePlayback(room, { video, currentTime: 0, isPlaying: false });

      io.to(room.code).emit('video-changed', { video, currentTime: 0, isPlaying: false });
      io.to(room.code).emit('room-updated', getRoomState(room));
      callback?.({ success: true, video });
    } catch (err) {
      callback?.({ success: false, error: err.message || 'Не удалось загрузить видео' });
    }
  });

  socket.on('playback-sync', (data) => {
    const room = getSocketRoom();
    if (!room || room.hostSocketId !== socket.id) return;

    updatePlayback(room, {
      currentTime: data.currentTime,
      isPlaying: data.isPlaying,
    });

    socket.to(room.code).emit('playback-sync', {
      currentTime: data.currentTime,
      isPlaying: data.isPlaying,
      sentAt: Date.now(),
    });
  });

  socket.on('chat-message', ({ text }, callback) => {
    const room = getSocketRoom();
    if (!room || !text?.trim()) {
      callback?.({ success: false, error: 'Не в комнате' });
      return;
    }

    const message = addChatMessage(room, socket.id, userName, text);
    io.to(room.code).emit('chat-message', message);
    callback?.({ success: true, message });
  });

  socket.on('disconnect', () => {
    const room = getSocketRoom();
    if (!room) return;

    const wasHost = socket.id === room.hostSocketId;
    room.users.delete(socket.id);
    delete socket.data.roomCode;

    if (wasHost && room.users.size > 0) {
      transferHost(room);
      io.to(room.code).emit('host-changed', { hostId: room.hostSocketId });
    }

    io.to(room.code).emit('room-updated', getRoomState(room));
    deleteRoomIfEmpty(room.code);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Watch Together: http://localhost:${PORT} (${isProd ? 'production' : 'dev'})`);
});
