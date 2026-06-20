import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket, emitWithCallback } from '../hooks/useSocket.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import Chat from '../components/Chat.jsx';

export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, connected, clientUserId } = useSocket();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState('');

  const roomCodeRef = useRef(null);
  const joiningRef = useRef(false);

  const isHost =
    room?.hostClientId === clientUserId || room?.hostId === socket?.id;

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
    setIsPlaying(result.room.isPlaying);
    setCurrentTime(result.room.currentTime);
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

    const onVideoChanged = ({ video, currentTime: time, isPlaying: playing }) => {
      setRoom((prev) => (prev ? { ...prev, video } : prev));
      setCurrentTime(time);
      setIsPlaying(playing);
      setError('');
    };

    const onPlaybackSync = ({ currentTime: time, isPlaying: playing }) => {
      setCurrentTime(time);
      setIsPlaying(playing);
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

  const syncThrottleRef = useRef(null);

  const handleSync = useCallback(
    ({ currentTime: time, isPlaying: playing }) => {
      setCurrentTime(time);
      setIsPlaying(playing);
      socket?.emit('playback-sync', { currentTime: time, isPlaying: playing });
    },
    [socket]
  );

  const handleTimeUpdate = useCallback(
    (time) => {
      if (syncThrottleRef.current) return;
      syncThrottleRef.current = setTimeout(() => {
        syncThrottleRef.current = null;
      }, 2500);
      socket?.emit('playback-sync', { currentTime: time, isPlaying: true });
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
          {isHost && (
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
          )}

          {error && <p className="error-msg">{error}</p>}

          <VideoPlayer
            video={room.video}
            isHost={isHost}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onSync={handleSync}
            onTimeUpdate={handleTimeUpdate}
          />

          {!isHost && (
            <p className="host-hint">⏯ Управление воспроизведением — у хоста комнаты</p>
          )}
        </section>

        <aside className="sidebar">
          <Chat messages={messages} onSend={handleSendChat} connected={connected} />
        </aside>
      </div>
    </main>
  );
}
