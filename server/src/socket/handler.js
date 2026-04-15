const jwt = require('jsonwebtoken');
const {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  findRoomBySocket,
  getPlaybackState,
  updatePlaybackState,
  addToQueue,
  removeFromQueue,
  nextSong,
  toggleRepeat,
  moveInQueue,
  errorSkipSong,
  kickMember,
  restrictMember,
  unrestrictMember,
  transferHost,
  isRestricted,
} = require('../utils/roomManager');

function setupSocket(io) {
  // Authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.user.username} (${socket.id})`);

    // --- ROOM EVENTS ---

    // Create a new room
    socket.on('room:create', ({ name, password }, callback) => {
      const room = createRoom({
        name,
        password,
        host: { socketId: socket.id, userId: socket.user.userId, username: socket.user.username },
      });

      // Host auto-joins
      joinRoom(room.id, socket.id, { userId: socket.user.userId, username: socket.user.username });
      socket.join(room.id);

      callback({
        success: true,
        room: {
          id: room.id,
          name: room.name,
          hostId: room.hostId,
        },
      });

      // Broadcast updated room list
      io.emit('rooms:updated');
      console.log(`🏠 Room created: ${room.name} (${room.id}) by ${socket.user.username}`);
    });

    // Join an existing room
    socket.on('room:join', ({ roomId, password }, callback) => {
      const room = getRoom(roomId);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const isAlreadyMember = room.members.has(socket.id);

      // Check password only for new members
      if (!isAlreadyMember && room.password && room.password !== password) {
        return callback({ success: false, error: 'Wrong password' });
      }

      joinRoom(roomId, socket.id, { userId: socket.user.userId, username: socket.user.username });
      socket.join(roomId);

      // Get current state for the new joiner
      const playbackState = getPlaybackState(room);
      const members = Array.from(room.members.values());

      callback({
        success: true,
        room: {
          id: room.id,
          name: room.name,
          hostId: room.hostId,
        },
        playbackState,
        members,
        messages: room.messages.slice(-50), // Last 50 messages
        restricted: Array.from(room.restricted),
      });

      // Notify others only if new member
      if (!isAlreadyMember) {
        socket.to(roomId).emit('member:joined', {
          userId: socket.user.userId,
          username: socket.user.username,
        });
        io.emit('rooms:updated');
        console.log(`➡️ ${socket.user.username} joined room ${room.name}`);
      }
    });

    // Leave room
    socket.on('room:leave', () => {
      handleLeaveRoom(socket, io);
    });

    // --- PLAYBACK EVENTS (Host only) ---

    socket.on('player:play', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      updatePlaybackState(room, { isPlaying: true, currentTime });
      socket.to(room.id).emit('player:play', { currentTime });
    });

    socket.on('player:pause', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      // Anyone can pause
      updatePlaybackState(room, { isPlaying: false, currentTime });
      socket.to(room.id).emit('player:pause', { currentTime });
    });

    socket.on('player:seek', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      updatePlaybackState(room, { currentTime });
      socket.to(room.id).emit('player:seek', { currentTime });
    });

    socket.on('player:next', () => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      const next = nextSong(room);
      io.to(room.id).emit('player:songChanged', {
        playbackState: getPlaybackState(room),
      });
    });

    // Song ended - auto next
    socket.on('player:ended', () => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      const next = nextSong(room);
      io.to(room.id).emit('player:songChanged', {
        playbackState: getPlaybackState(room),
      });
    });

    // Video error (e.g. embedding disabled) - remove song and skip
    socket.on('player:errorSkip', () => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      const skipped = errorSkipSong(room);
      io.to(room.id).emit('player:songChanged', {
        playbackState: getPlaybackState(room),
      });
      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });
      console.log(`⚠️ Error skip in room ${room.name}`);
    });

    // --- QUEUE EVENTS ---

    socket.on('queue:add', (song, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false });

      const newSong = {
        ...song,
        addedBy: socket.user.username,
      };

      const result = addToQueue(room, newSong, socket.user.userId);
      if (result === 'restricted') return callback?.({ success: false, error: 'Bạn đã bị hạn chế thêm nhạc' });
      if (!result) return callback?.({ success: false, error: 'Hàng đợi đã đầy' });

      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });

      // If this is the first song, notify about song change
      if (room.queue.length === 1) {
        io.to(room.id).emit('player:songChanged', {
          playbackState: getPlaybackState(room),
        });
      }

      callback?.({ success: true });
      console.log(`🎵 ${socket.user.username} added "${song.title}" to queue`);
    });

    socket.on('queue:remove', ({ index }, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false });

      const result = removeFromQueue(room, index);
      if (!result) return callback?.({ success: false, error: 'Cannot remove this song' });

      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });

      callback?.({ success: true });
    });

    socket.on('queue:move', ({ fromIndex, toIndex }, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false });

      const result = moveInQueue(room, fromIndex, toIndex);
      if (!result) return callback?.({ success: false, error: 'Cannot move this song' });

      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });

      callback?.({ success: true });
    });

    // --- REPEAT ---

    socket.on('player:toggleRepeat', (callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return callback?.({ success: false });

      const repeat = toggleRepeat(room);
      io.to(room.id).emit('player:repeatChanged', { repeat });
      callback?.({ success: true, repeat });
    });

    // --- MEMBER MANAGEMENT (Host only) ---

    socket.on('member:kick', ({ targetUserId }, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return callback?.({ success: false });
      if (String(targetUserId) === String(room.hostId)) return callback?.({ success: false, error: 'Cannot kick yourself' });

      const kickedSocketId = kickMember(room, targetUserId);
      if (!kickedSocketId) return callback?.({ success: false, error: 'Member not found' });

      // Force the kicked socket to leave the room
      const kickedSocket = io.sockets.sockets.get(kickedSocketId);
      if (kickedSocket) {
        kickedSocket.leave(room.id);
        kickedSocket.emit('room:kicked');
      }

      io.to(room.id).emit('member:left', { userId: targetUserId });
      io.to(room.id).emit('member:listUpdated', { members: Array.from(room.members.values()), restricted: Array.from(room.restricted) });
      io.emit('rooms:updated');
      callback?.({ success: true });
    });

    socket.on('member:restrict', ({ targetUserId }, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return callback?.({ success: false });
      if (String(targetUserId) === String(room.hostId)) return callback?.({ success: false });

      if (isRestricted(room, targetUserId)) {
        unrestrictMember(room, targetUserId);
      } else {
        restrictMember(room, targetUserId);
      }

      io.to(room.id).emit('member:listUpdated', { members: Array.from(room.members.values()), restricted: Array.from(room.restricted) });
      callback?.({ success: true, restricted: Array.from(room.restricted) });
    });

    socket.on('member:transferHost', ({ targetUserId }, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return callback?.({ success: false });
      if (String(targetUserId) === String(room.hostId)) return callback?.({ success: false });

      const transferred = transferHost(room, targetUserId);
      if (!transferred) return callback?.({ success: false });

      io.to(room.id).emit('room:hostChanged', { hostId: room.hostId });
      io.to(room.id).emit('member:listUpdated', { members: Array.from(room.members.values()), restricted: Array.from(room.restricted) });
      callback?.({ success: true });
    });

    // --- CHAT EVENTS ---

    socket.on('chat:message', ({ text }) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !text?.trim()) return;

      const message = {
        username: socket.user.username,
        text: text.trim(),
        timestamp: Date.now(),
      };

      room.messages.push(message);
      // Keep only last 200 messages
      if (room.messages.length > 200) {
        room.messages = room.messages.slice(-200);
      }

      io.to(room.id).emit('chat:message', message);
    });

    // --- DISCONNECT ---

    socket.on('disconnect', () => {
      handleLeaveRoom(socket, io);
      console.log(`🔌 Disconnected: ${socket.user.username}`);
    });
  });
}

function handleLeaveRoom(socket, io) {
  const room = findRoomBySocket(socket.id);
  if (!room) return;

  const roomId = room.id;
  const result = leaveRoom(roomId, socket.id);

  socket.leave(roomId);

  if (result && !result.deleted) {
    socket.to(roomId).emit('member:left', {
      userId: socket.user.userId,
      username: socket.user.username,
    });

    // If host changed, notify
    if (result.room.hostSocketId !== socket.id) {
      io.to(roomId).emit('room:hostChanged', {
        hostId: result.room.hostId,
      });
    }
  }

  io.emit('rooms:updated');
}

module.exports = { setupSocket };
