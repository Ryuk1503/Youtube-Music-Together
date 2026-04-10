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
      if (!room || room.hostSocketId !== socket.id) return;

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

    // --- QUEUE EVENTS ---

    socket.on('queue:add', (song, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false });

      const newSong = {
        ...song,
        addedBy: socket.user.username,
      };

      addToQueue(room, newSong);

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
