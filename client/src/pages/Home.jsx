import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket.jsx';

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connected } = useSocket();
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const joinCode = searchParams.get('join');
    if (joinCode) {
      setRoomCode(joinCode.toUpperCase());
    }
  }, [searchParams]);

  const handleCreate = async () => {
    if (!connected) {
      setError('Подождите подключения к серверу...');
      return;
    }

    sessionStorage.setItem('watchUserName', name || 'Хост');
    sessionStorage.setItem('watchIsHost', 'true');
    navigate('/room/new');
  };

  const handleJoin = () => {
    if (!connected) {
      setError('Подождите подключения к серверу...');
      return;
    }

    if (!roomCode.trim()) {
      setError('Введите код комнаты');
      return;
    }

    setError('');
    sessionStorage.setItem('watchUserName', name || 'Гость');
    sessionStorage.removeItem('watchIsHost');
    navigate(`/room/${roomCode.trim().toUpperCase()}`);
  };

  return (
    <main className="page home-page">
      <div className="glass-card home-card">
        <div className="logo-block">
          <h1>Watch Together</h1>
          <p className="subtitle">Смотрите видео вместе — YouTube, VK и весь интернет</p>
        </div>

        <div className="form-group">
          <label htmlFor="name">Ваше имя</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как вас называть?"
            maxLength={24}
          />
        </div>

        <div className="home-actions">
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!connected}
          >
            🎬 Создать комнату
          </button>

          <div className="divider">
            <span>или войти</span>
          </div>

          <div className="join-row">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Код комнаты"
              maxLength={6}
              className="code-input"
            />
            <button
              className="btn btn-secondary"
              onClick={handleJoin}
              disabled={!connected}
            >
              Войти
            </button>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="connection-status">
          <span className={`dot ${connected ? 'online' : 'offline'}`} />
          {connected ? 'Сервер подключён' : 'Подключение...'}
        </div>

        <div className="features">
          <div className="feature">
            <span>🔗</span>
            <p>YouTube, VK, Rutube и другие</p>
          </div>
          <div className="feature">
            <span>⏱️</span>
            <p>Синхронный плеер</p>
          </div>
          <div className="feature">
            <span>💬</span>
            <p>Чат в реальном времени</p>
          </div>
        </div>
      </div>
    </main>
  );
}
