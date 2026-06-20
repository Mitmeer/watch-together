import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
const SOCKET_URL = import.meta.env.DEV ? '' : window.location.origin;

let sharedSocket = null;

function getClientUserId() {
  let id = sessionStorage.getItem('watchClientUserId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('watchClientUserId', id);
  }
  return id;
}

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
  }
  return sharedSocket;
}

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    const socket = getSharedSocket();

    const onConnect = () => {
      setConnected(true);
      setSocketId(socket.id);
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{ socket: getSharedSocket(), connected, socketId, clientUserId: getClientUserId() }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}

export function emitWithCallback(socket, event, data, timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ success: false, error: 'Нет соединения с сервером' });
      return;
    }

    const payload = { ...data, clientUserId: getClientUserId() };

    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Превышено время ожидания. Попробуйте снова.' });
    }, timeoutMs);

    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result ?? { success: false, error: 'Нет ответа от сервера' });
    });
  });
}
