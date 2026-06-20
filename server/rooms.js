import { customAlphabet } from 'nanoid';

const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const rooms = new Map();

export function createRoom(hostId, hostName) {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));

  const room = {
    code,
    hostId,
    video: null,
    currentTime: 0,
    isPlaying: false,
    lastSyncAt: Date.now(),
    users: new Map([[hostId, { id: hostId, name: hostName, isHost: true }]]),
    chat: [],
  };

  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code?.toUpperCase()) ?? null;
}

export function deleteRoomIfEmpty(code) {
  const room = rooms.get(code);
  if (room && room.users.size === 0) {
    rooms.delete(code);
  }
}

export function getRoomState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    video: room.video,
    currentTime: room.currentTime,
    isPlaying: room.isPlaying,
    users: Array.from(room.users.values()),
    chat: room.chat.slice(-100),
  };
}

export function addChatMessage(room, userId, userName, text) {
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    userName,
    text: text.trim().slice(0, 500),
    timestamp: Date.now(),
  };
  room.chat.push(message);
  if (room.chat.length > 200) {
    room.chat = room.chat.slice(-200);
  }
  return message;
}

export function transferHost(room) {
  const nextHost = room.users.values().next().value;
  if (!nextHost) return;

  room.hostId = nextHost.id;
  for (const [id, user] of room.users) {
    user.isHost = id === room.hostId;
  }
}

export function updatePlayback(room, { currentTime, isPlaying, video }) {
  if (video !== undefined) {
    room.video = video;
  }
  if (currentTime !== undefined) {
    room.currentTime = currentTime;
  }
  if (isPlaying !== undefined) {
    room.isPlaying = isPlaying;
  }
  room.lastSyncAt = Date.now();
}
