const { randomUUID: uuidv4 } = require('node:crypto');
const { getListeningTime } = require('./listeningTime');

// In-memory room storage
const rooms = new Map();
const EMPTY_ROOM_TTL = 10 * 60 * 1000;
let changeObserver = null;

// Lets roomPersistence snapshot the in-memory state, which is the only copy of
// a live room that exists.
function observeRoomChanges(observer) { changeObserver = observer; }
function changed() { changeObserver?.(); }

function createRoom({ name, password, host }) {
  const id = uuidv4().slice(0, 8);
  const room = {
    id,
    sessionId: uuidv4(),
    name,
    password: password || null, // null = no password
    hostId: host.userId,
    hostSocketId: host.socketId,
    ownerId: host.userId,
    ownerName: host.username,
    participants: new Map([[String(host.userId), host.username]]), // userId -> username, everyone who ever joined
    members: new Map(), // socketId -> { userId, username }
    restricted: new Set(), // Set of userId strings that can't add songs
    queue: [], // [{ videoId, title, thumbnail, duration, addedBy }]
    currentIndex: -1,
    isPlaying: false,
    listenedMs: 0,
    listeningUpdatedAt: Date.now(),
    autoplay: true,
    autoplayLoading: false,
    autoplayError: '',
    recentVideoIds: [],
    sessionArtists: new Set(),
    currentTime: 0,
    lastSyncedAt: Date.now(),
    messages: [], // [{ username, text, timestamp }]
    createdAt: Date.now(),
    emptyRoomTimer: null,
  };
  rooms.set(id, room);
  changed();
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
  const wasEmpty = room.members.size === 0;
  getListeningTime(room);
  if (room.emptyRoomTimer) {
    clearTimeout(room.emptyRoomTimer);
    room.emptyRoomTimer = null;
  }
  room.members.set(socketId, { userId: user.userId, username: user.username });
  room.participants.set(String(user.userId), user.username);
  if (wasEmpty) {
    room.hostId = user.userId;
    room.hostSocketId = socketId;
  }
  changed();
  return room;
}

function leaveRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  getListeningTime(room);
  room.members.delete(socketId);

  // Keep empty rooms briefly so a refresh or reconnect can recover the room.
  if (room.members.size === 0) {
    room.emptyRoomTimer = setTimeout(() => {
      if (room.members.size === 0 && rooms.get(roomId) === room) {
        rooms.delete(roomId);
        room.onClosed?.(room, 'ttl');
      }
      room.emptyRoomTimer = null;
    }, EMPTY_ROOM_TTL);
    changed();
    return { deleted: false, room };
  }

  // If host left, transfer to first member
  if (room.hostSocketId === socketId) {
    const [newHostSocketId, newHost] = room.members.entries().next().value;
    room.hostId = newHost.userId;
    room.hostSocketId = newHostSocketId;
  }

  changed();
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
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.emptyRoomTimer);
  rooms.delete(roomId);
  changed();
  room.onClosed?.(room, 'ended');
}

const MAX_QUEUE_SIZE = 200;

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
    autoplay: room.autoplay,
    autoplayLoading: room.autoplayLoading,
    autoplayError: room.autoplayError,
    listeningTime: getListeningTime(room),
  };
}

function updatePlaybackState(room, { isPlaying, currentTime }) {
  getListeningTime(room);
  if (currentTime !== undefined) room.currentTime = currentTime;
  if (isPlaying !== undefined) room.isPlaying = isPlaying;
  room.lastSyncedAt = Date.now();
  changed();
}

function addToQueue(room, song, userId) {
  if (room.queue.length >= MAX_QUEUE_SIZE && room.currentIndex > 0) {
    room.queue.splice(0, room.currentIndex);
    room.currentIndex = 0;
  }
  if (room.queue.length >= MAX_QUEUE_SIZE) return null;
  if (userId && room.restricted.has(String(userId))) return 'restricted';
  room.queue.push(song);
  if (userId != null && !song.recommended) {
    room.memberAdditions ||= new Map();
    const member = room.memberAdditions.get(String(userId)) || { name: song.addedBy || 'Thành viên', count: 0 };
    member.count++;
    room.memberAdditions.set(String(userId), member);
  }
  // If nothing is playing, start playing this song
  if (room.currentIndex === -1) {
    room.currentIndex = 0;
    room.isPlaying = false;
    room.currentTime = 0;
    room.lastSyncedAt = Date.now();
  }
  changed();
  return room.queue;
}

function removeFromQueue(room, index) {
  if (index <= room.currentIndex) return null; // Can't remove current or past songs
  if (index < 0 || index >= room.queue.length) return null;
  room.queue.splice(index, 1);
  changed();
  return room.queue;
}

function nextSong(room) {
  getListeningTime(room);
  if (room.currentIndex + 1 < room.queue.length) {
    room.currentIndex++;
    room.currentTime = 0;
    room.isPlaying = true;
    room.lastSyncedAt = Date.now();
    changed();
    return room.queue[room.currentIndex];
  }
  // No manually queued song remains.
  room.isPlaying = false;
  room.currentTime = 0;
  room.lastSyncedAt = Date.now();
  changed();
  return null;
}

function toggleAutoplay(room) {
  room.autoplay = !room.autoplay;
  changed();
  return room.autoplay;
}

function moveInQueue(room, fromIndex, toIndex) {
  // Can only move upcoming songs (after currentIndex)
  if (fromIndex <= room.currentIndex || toIndex <= room.currentIndex) return null;
  if (fromIndex < 0 || fromIndex >= room.queue.length) return null;
  if (toIndex < 0 || toIndex >= room.queue.length) return null;
  if (fromIndex === toIndex) return null;

  const [song] = room.queue.splice(fromIndex, 1);
  room.queue.splice(toIndex, 0, song);
  changed();
  return room.queue;
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
  toggleAutoplay,
  moveInQueue,
  kickMember,
  restrictMember,
  unrestrictMember,
  transferHost,
  isRestricted,
  changed,
  observeRoomChanges,
  snapshotRooms,
  restoreRooms,
};

function kickMember(room, targetUserId) {
  getListeningTime(room);
  for (const [socketId, member] of room.members) {
    if (String(member.userId) === String(targetUserId)) {
      room.members.delete(socketId);
      room.restricted.delete(String(targetUserId));
      changed();
      return socketId;
    }
  }
  return null;
}

function restrictMember(room, targetUserId) {
  room.restricted.add(String(targetUserId));
  changed();
}

function unrestrictMember(room, targetUserId) {
  room.restricted.delete(String(targetUserId));
  changed();
}

function transferHost(room, targetUserId) {
  for (const [socketId, member] of room.members) {
    if (String(member.userId) === String(targetUserId)) {
      room.hostId = member.userId;
      room.hostSocketId = socketId;
      changed();
      return true;
    }
  }
  return false;
}

function isRestricted(room, userId) {
  return room.restricted.has(String(userId));
}

// --- crash recovery ------------------------------------------------------

function serializeRoom(room) {
  return {
    id: room.id,
    sessionId: room.sessionId,
    name: room.name,
    password: room.password,
    hostId: room.hostId,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    participants: [...room.participants],
    restricted: [...room.restricted],
    queue: room.queue,
    currentIndex: room.currentIndex,
    isPlaying: room.isPlaying,
    currentTime: room.currentTime,
    lastSyncedAt: room.lastSyncedAt,
    autoplay: room.autoplay,
    autoplayError: room.autoplayError || '',
    recentVideoIds: room.recentVideoIds || [],
    sessionArtists: [...(room.sessionArtists || [])],
    memberAdditions: [...(room.memberAdditions || new Map())],
    songListening: [...(room.songListening || new Map())],
    artistListening: [...(room.artistListening || new Map())],
    listenedMs: room.listenedMs || 0,
    listeningUpdatedAt: room.listeningUpdatedAt,
    messages: room.messages.slice(-50),
    createdAt: room.createdAt,
  };
}

// A room that is being ended is already saved to history; it must not come back.
function snapshotRooms() {
  const list = [];
  for (const room of rooms.values()) if (!room.ending) list.push(serializeRoom(room));
  return list;
}

function pairs(value) {
  return Array.isArray(value) ? value.filter(entry => Array.isArray(entry) && entry.length === 2) : [];
}

function restoreRoom(entry) {
  const queue = (Array.isArray(entry.queue) ? entry.queue : [])
    .filter(song => song && typeof song.videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(song.videoId))
    .map(song => ({ ...song }));
  const lastSyncedAt = Number(entry.lastSyncedAt) || Date.now();
  const room = {
    id: entry.id,
    sessionId: entry.sessionId,
    name: entry.name,
    password: entry.password || null,
    hostId: entry.hostId ?? null,
    hostSocketId: null,
    ownerId: entry.ownerId ?? null,
    ownerName: entry.ownerName || 'Chủ phòng',
    participants: new Map(pairs(entry.participants)),
    members: new Map(),
    restricted: new Set((Array.isArray(entry.restricted) ? entry.restricted : []).map(String)),
    queue,
    currentIndex: Math.min(Number.isInteger(entry.currentIndex) ? entry.currentIndex : -1, queue.length - 1),
    isPlaying: !!entry.isPlaying && queue.length > 0,
    listenedMs: Number(entry.listenedMs) || 0,
    listeningUpdatedAt: Date.now(), // downtime was not listening time
    autoplay: entry.autoplay !== false,
    autoplayLoading: false,
    autoplayError: typeof entry.autoplayError === 'string' ? entry.autoplayError : '',
    recentVideoIds: Array.isArray(entry.recentVideoIds) ? entry.recentVideoIds.filter(id => typeof id === 'string') : [],
    sessionArtists: new Set((Array.isArray(entry.sessionArtists) ? entry.sessionArtists : []).map(String)),
    memberAdditions: new Map(pairs(entry.memberAdditions)),
    songListening: new Map(pairs(entry.songListening)),
    artistListening: new Map(pairs(entry.artistListening)),
    currentTime: Math.max(0, Number(entry.currentTime) || 0),
    lastSyncedAt: Date.now(),
    messages: (Array.isArray(entry.messages) ? entry.messages.slice(-50) : []),
    createdAt: Number(entry.createdAt) || Date.now(),
    emptyRoomTimer: null,
  };
  applyDowntime(room, lastSyncedAt);
  return room;
}

// Playing rooms keep their clock out of the snapshot, so catch the song up to
// real time and hop forward over any song that ended while the server was gone.
function applyDowntime(room, lastSyncedAt) {
  if (!room.isPlaying || room.currentIndex < 0) return;
  let remaining = room.currentTime + Math.max(0, Date.now() - lastSyncedAt) / 1000;
  for (;;) {
    const duration = Number(room.queue[room.currentIndex]?.duration) || 0;
    if (!duration || remaining < duration) break;
    remaining -= duration;
    if (room.currentIndex + 1 < room.queue.length) room.currentIndex++;
    else { room.isPlaying = false; remaining = 0; }
  }
  room.currentTime = Math.max(0, remaining);
}

function restoreRooms(entries) {
  const restored = [];
  if (!Array.isArray(entries)) return restored;
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.sessionId !== 'string' ||
        typeof entry.name !== 'string' || rooms.has(entry.id)) continue;
    const room = restoreRoom(entry);
    rooms.set(room.id, room);
    // Nobody is reconnected yet: the room expires like any other empty room.
    room.emptyRoomTimer = setTimeout(() => {
      if (room.members.size === 0 && rooms.get(room.id) === room) {
        rooms.delete(room.id);
        room.onClosed?.(room, 'ttl');
      }
      room.emptyRoomTimer = null;
    }, EMPTY_ROOM_TTL);
    room.emptyRoomTimer.unref?.();
    restored.push(room);
  }
  if (restored.length) changed();
  return restored;
}
