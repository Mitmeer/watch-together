import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket, emitWithCallback } from '../hooks/useSocket.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import Chat from '../components/Chat.jsx';

function nextSyncTick(data) {
  return {
    currentTime: data.currentTime ?? 0,
    isPlaying: Boolean(data.isPlaying),
    sentAt: data.sentAt || Date.now(),
    id: `${Date.now()}-${Math.random()}`,
  };
}

export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [error, setError] = useState('');
  const [syncTick, setSyncTick] = useState(null);
  const [copied, setCopied] = useState('');

  const roomCodeRef = useRef(null);
  const joiningRef = useRef(false);

  const joinRoom = useCallback(async () => {
    if (!socket || !connected || joiningRef.current) return;

    const userName = sessionStorage.getItem('watchUserName') || 'Гость';
    const shouldCreate = sessionStorage.getItem('watchIsHost') === 'true';
    const targetCode = roomCodeRef.current || code;

    if (!shouldCreate && (!targetCode || targetCode.toLowerCase() === 'new')) {
      setError('Неверная ссылка комнаты');
      return;
    }

    joiningRef.current = true;
    setError('');

    let result;
    if (shouldCreate) {
      sessionStorage.removeItem('watchIsHost');
      result = await emitWithCallback(socket, 'create-room', { name: userName });
      if (result.success) {
        roomCodeRef.current = result.room.code;
        navigate(`/room/${result.room.code}`, { replace: true });
      }
    } else {
      result = await emitWithCallback(socket, 'join-room', {
        code: targetCode.toUpperCase(),
        name: userName,
      });
    }

    joiningRef.current = false;

    if (!result?.success) {
      setError(result?.error || 'Комната не найдена');
      return;
    }

    roomCodeRef.current = result.room.code;
    setRoom(result.room);
    setMessages(result.room.chat || []);
    setSyncTick(
      nextSyncTick({
        currentTime: result.room.currentTime,
        isPlaying: result.room.isPlaying,
        sentAt: result.room.sentAt || Date.now(),
      })
    );
  }, [socket, connected, code, navigate]);

  useEffect(() => {
    joinRoom();
  }, [joinRoom]);

  useEffect(() => {
    if (!socket) return;

    const rejoin = () => {
      if (roomCodeRef.current) joinRoom();
    };

    socket.on('disconnect', () => {
      joiningRef.current = false;
    });
    socket.io.on('reconnect', rejoin);

    return () => {
      socket.off('disconnect');
      socket.io.off('reconnect', rejoin);
    };
  }, [socket, joinRoom]);

  useEffect(() => {
    if (!socket) return;

    const onRoomUpdated = (updated) => setRoom(updated);

    const onVideoChanged = ({ video, currentTime, isPlaying, sentAt }) => {
      setRoom((prev) => (prev ? { ...prev, video } : prev));
      setSyncTick(nextSyncTick({ currentTime, isPlaying, sentAt }));
      setError('');
    };

    const onPlaybackSync = ({ currentTime, isPlaying, sentAt }) => {
      setSyncTick(nextSyncTick({ currentTime, isPlaying, sentAt }));
    };

    const onChatMessage = (message) => {
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      );
    };

    socket.on('room-updated', onRoomUpdated);
    socket.on('video-changed', onVideoChanged);
    socket.on('playback-sync', onPlaybackSync);
    socket.on('chat-message', onChatMessage);

    return () => {
      socket.off('room-updated', onRoomUpdated);
      socket.off('video-changed', onVideoChanged);
      socket.off('playback-sync', onPlaybackSync);
      socket.off('chat-message', onChatMessage);
    };
  }, [socket]);

  const handleSetVideo = async () => {
    if (!socket || !videoUrl.trim()) return;

    setLoadingVideo(true);
    setError('');

    const result = await emitWithCallback(socket, 'set-video', { url: videoUrl.trim() });

    setLoadingVideo(false);

    if (!result.success) {
      setError(result.error || 'Не удалось загрузить видео');
    } else {
      setVideoUrl('');
    }
  };

  const handleUserAction = useCallback(
    ({ currentTime, isPlaying }) => {
      socket?.emit('playback-sync', { currentTime, isPlaying });
    },
    [socket]
  );

  const handleSendChat = async (text) => {
    const result = await emitWithCallback(socket, 'chat-message', { text });
    if (result?.success && result.message) {
      setMessages((prev) =>
        prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]
      );
    }
  };

  const copyCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      setCopied('code');
      setTimeout(() => setCopied(''), 2000);
    }
  };

  const copyInviteLink = () => {
    if (room?.code) {
      const url = `${window.location.origin}/?join=${room.code}`;
      navigator.clipboard.writeText(url);
      setCopied('link');
      setTimeout(() => setCopied(''), 2000);
    }
  };

  if (!room && !error) {
    return (
      <main className="page room-page">
        <div className="glass-card loading-card">Подключение к комнате...</div>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="page room-page">
        <div className="glass-card error-card">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            На главную
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page room-page">
      <header className="room-header glass-card">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← Назад
        </button>

        <div className="room-code-block">
          <span className="room-label">Код комнаты</span>
          <button className="room-code" onClick={copyCode} title="Скопировать код">
            {room.code}
          </button>
          <button className="btn-share" onClick={copyInviteLink}>
            {copied === 'link' ? '✓ Ссылка скопирована' : '🔗 Пригласить друга'}
          </button>
          {copied === 'code' && <span className="copy-hint">Код скопирован!</span>}
        </div>

        <div className="room-users">
          {room.users.map((u) => (
            <span key={u.id} className={`user-badge ${u.isHost ? 'host' : ''}`}>
              {u.isHost ? '👑' : '👤'} {u.name}
            </span>
          ))}
        </div>
      </header>

      <div className="room-layout">
        <section className="player-section glass-card">
          <div className="url-bar">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetVideo()}
              placeholder="Вставьте ссылку: YouTube, VK, Rutube..."
              disabled={loadingVideo}
            />
            <button
              className="btn btn-primary"
              onClick={handleSetVideo}
              disabled={loadingVideo || !videoUrl.trim()}
            >
              {loadingVideo ? 'Загрузка...' : 'Загрузить'}
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <VideoPlayer
            video={room.video}
            syncTick={syncTick}
            onUserAction={handleUserAction}
            hasVideo={Boolean(room.video)}
          />
        </section>

        <aside className="sidebar">
          <Chat messages={messages} onSend={handleSendChat} connected={connected} />
        </aside>
      </div>
    </main>
  );
}
