const { v4: uuidv4 } = require('uuid');

// In-memory room storage
const rooms = new Map();

function createRoom({ name, password, host }) {
  const id = uuidv4().slice(0, 8);
  const room = {
    id,
    name,
    password: password || null, // null = no password
    hostId: host.userId,
    hostSocketId: host.socketId,
    members: new Map(), // socketId -> { userId, username }
    queue: [], // [{ videoId, title, thumbnail, duration, addedBy }]
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    lastSyncedAt: Date.now(),
    messages: [], // [{ username, text, timestamp }]
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function getAllRooms() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({
      id,
      name: room.name,
      hasPassword: !!room.password,
      memberCount: room.members.size,
      currentSong: room.currentIndex >= 0 ? room.queue[room.currentIndex] : null,
      createdAt: room.createdAt,
    });
  }
  return list;
}

function joinRoom(roomId, socketId, user) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.members.set(socketId, { userId: user.userId, username: user.username });
  return room;
}

function leaveRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.members.delete(socketId);

  // If room is empty, delete it
  if (room.members.size === 0) {
    rooms.delete(roomId);
    return { deleted: true, room };
  }

  // If host left, transfer to first member
  if (room.hostSocketId === socketId) {
    const [newHostSocketId, newHost] = room.members.entries().next().value;
    room.hostId = newHost.userId;
    room.hostSocketId = newHostSocketId;
  }

  return { deleted: false, room };
}

function findRoomBySocket(socketId) {
  for (const [roomId, room] of rooms) {
    if (room.members.has(socketId)) {
      return room;
    }
  }
  return null;
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

function getPlaybackState(room) {
  let currentTime = room.currentTime;
  if (room.isPlaying) {
    currentTime += (Date.now() - room.lastSyncedAt) / 1000;
  }
  return {
    currentIndex: room.currentIndex,
    currentSong: room.currentIndex >= 0 ? room.queue[room.currentIndex] : null,
    isPlaying: room.isPlaying,
    currentTime,
    queue: room.queue,
  };
}

function updatePlaybackState(room, { isPlaying, currentTime }) {
  if (currentTime !== undefined) room.currentTime = currentTime;
  if (isPlaying !== undefined) room.isPlaying = isPlaying;
  room.lastSyncedAt = Date.now();
}

function addToQueue(room, song) {
  room.queue.push(song);
  // If nothing is playing, start playing this song
  if (room.currentIndex === -1) {
    room.currentIndex = 0;
    room.isPlaying = false;
    room.currentTime = 0;
    room.lastSyncedAt = Date.now();
  }
  return room.queue;
}

function removeFromQueue(room, index) {
  if (index <= room.currentIndex) return null; // Can't remove current or past songs
  if (index < 0 || index >= room.queue.length) return null;
  room.queue.splice(index, 1);
  return room.queue;
}

function nextSong(room) {
  if (room.currentIndex + 1 < room.queue.length) {
    room.currentIndex++;
    room.currentTime = 0;
    room.isPlaying = true;
    room.lastSyncedAt = Date.now();
    return room.queue[room.currentIndex];
  }
  // No more songs
  room.isPlaying = false;
  room.currentTime = 0;
  room.lastSyncedAt = Date.now();
  return null;
}

module.exports = {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  leaveRoom,
  findRoomBySocket,
  deleteRoom,
  getPlaybackState,
  updatePlaybackState,
  addToQueue,
  removeFromQueue,
  nextSong,
};
