const { advanceRoom, cancelAutoplay, prepareQueueEnd } = require('../utils/autoplay');
const { rememberArtist } = require('../utils/artistPreference');
const { getListeningTime } = require('../utils/listeningTime');
const { buildSessionSummary } = require('../utils/sessionSummary');
const { prepareArtistMetadata, finalizeArtistListening } = require('../utils/artistMetadata');
const { addAutomaticSong } = require('../utils/automaticQueue');
const { resolveSession, allowedSocketRequest } = require('../middleware/auth');
const { randomUUID } = require('node:crypto');
const { createHistoryRecorder, savePlayback } = require('../utils/musicHistory');
const {
  createRoom,
  deleteRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  leaveRoom,
  findRoomBySocket,
  getPlaybackState,
  updatePlaybackState,
  addToQueue,
  removeFromQueue,
  toggleAutoplay,
  moveInQueue,
  kickMember,
  restrictMember,
  unrestrictMember,
  transferHost,
  isRestricted,
  changed,
} = require('../utils/roomManager');

function setupSocket(io, { recommend, persistSession = async () => {}, artistMetadata = prepareArtistMetadata, prefetch = () => {}, persistPlayback = savePlayback, authenticateSession = socket => resolveSession(socket.handshake.headers), originAllowed = allowedSocketRequest, roomHistory = { opened: async () => {}, closed: async () => {} } } = {}) {
  let leaderboardNotification;
  const persistAndNotify = async entry => {
    await persistPlayback(entry);
    // Coalesce listeners/rooms; notify only after a successful database commit.
    if (!leaderboardNotification) {
      leaderboardNotification = setTimeout(() => {
        leaderboardNotification = null;
        io.emit('leaderboard:updated');
      }, 1000);
      leaderboardNotification.unref?.();
    }
  };
  io.httpServer?.once('close', () => clearTimeout(leaderboardNotification));
  const prepareAudio = room => {
    if (!room.ending && room.members.size) prefetch(room.queue[room.currentIndex + 1]?.videoId);
  };
  const prepareArtists = room => {
    const song = room.queue[room.currentIndex];
    if (!song) return;
    room.artistMetadata ||= new Map();
    if (!room.artistMetadata.has(song.videoId)) {
      room.artistMetadata.set(song.videoId, Promise.resolve().then(() => artistMetadata(song)).catch(() => null));
    }
  };
  const publish = (room) => {
    prepareAudio(room);
    prepareArtists(room);
    io.to(room.id).emit('player:songChanged', { playbackState: getPlaybackState(room) });
    io.emit('rooms:updated');
  };
  const advance = (room, failed = false) => advanceRoom(room, {
    failed, recommend, notify: () => publish(room), isCurrent: () => getRoom(room.id) === room,
  }).catch(error => console.error('Autoplay failed:', error.message));
  const earlyAutoplayTimer = setInterval(() => {
    for (const { id } of getAllRooms()) {
      const room = getRoom(id);
      prepareQueueEnd(room, {
        recommend, isCurrent: () => getRoom(id) === room,
        notify: () => {
          prepareAudio(room);
          io.to(id).emit('queue:updated', { queue: room.queue, currentIndex: room.currentIndex });
        },
      }).catch(error => console.error('Early autoplay failed:', error.message));
    }
  }, 1000);
  earlyAutoplayTimer.unref();
  io.httpServer?.once('close', () => clearInterval(earlyAutoplayTimer));
  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      if(!originAllowed(socket.handshake.headers))return next(new Error('Invalid origin'));
      const account=await authenticateSession(socket);
      if(!account)return next(new Error('Authentication required'));
      socket.user={userId:account.id,username:account.username,type:'account',isAdmin:!!account.is_admin};
      socket.sessionHash=account.token_hash;
      socket.sessionHeaders=socket.handshake.headers;
      next();
    }catch{next(new Error('Authentication unavailable'));}
  });

  io.on('connection', (socket) => {
    let eventWindow=Date.now(), eventCount=0;
    socket.use(async (packet,next)=>{
      if(Date.now()-eventWindow>60000){eventWindow=Date.now();eventCount=0;}
      if(++eventCount>240)return next(new Error('Too many requests'));
      try {
        const account=await authenticateSession(socket);
        if(!account){socket.disconnect(true);return;}
        socket.user.username=account.username;
        socket.user.isAdmin=!!account.is_admin;
        next();
      }catch{next(new Error('Authentication unavailable'));}
    });

    socket.on('listening:progress', payload => {
      const room = findRoomBySocket(socket.id);
      if (room && !room.ending) {
        room.recordHistory ||= createHistoryRecorder(persistAndNotify);
        room.recordHistory(room, socket.user, payload);
      }
    });
    socket.use(([event, ...args], next) => {
      const room = findRoomBySocket(socket.id);
      if (room?.ending && event !== 'room:leave') {
        const callback = args.at(-1);
        if (typeof callback === 'function') callback({ success: false, error: 'Phòng đang lưu tổng kết. Vui lòng chờ.' });
        return;
      }
      next();
    });
    console.log(`🔌 Connected: ${socket.user.username} (${socket.id})`);

    // --- ROOM EVENTS ---

    // Create a new room
    socket.on('room:create', ({ name, password }, callback) => {
      handleLeaveRoom(socket, io);
      const room = createRoom({
        name,
        password,
        host: { socketId: socket.id, userId: socket.user.userId, username: socket.user.username },
      });

      // Host auto-joins
      joinRoom(room.id, socket.id, { userId: socket.user.userId, username: socket.user.username });
      socket.join(room.id);
      room.onClosed = (closedRoom, reason) => {
        roomHistory.closed(closedRoom, reason).catch(error => console.error('Room history close failed:', error.message));
      };
      roomHistory.opened(room).catch(error => console.error('Room history open failed:', error.message));

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

      const previousRoom = findRoomBySocket(socket.id);
      if (previousRoom && previousRoom !== room) handleLeaveRoom(socket, io);

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
    socket.on('room:leave', (payload = {}) => {
      if (payload.roomId && findRoomBySocket(socket.id)?.id !== payload.roomId) return;
      handleLeaveRoom(socket, io);
    });

    // --- PLAYBACK EVENTS ---
    socket.on('player:clock', ({ videoId, currentTime, duration } = {}) => {
      const room = findRoomBySocket(socket.id);
      const song = room?.queue[room.currentIndex];
      if (!room || room.hostSocketId !== socket.id || !room.isPlaying || !song || song.videoId !== videoId ||
          !Number.isFinite(duration) || duration <= 0 || duration > 604800 ||
          !Number.isFinite(currentTime) || currentTime < 0 || currentTime > duration) return;
      room.audioClock = { song, duration };
      updatePlaybackState(room, { currentTime });
    });
    socket.on('room:end', async (callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'Chỉ host mới có thể kết thúc phòng.' });
      }
      room.ending = true;
      cancelAutoplay(room);
      updatePlaybackState(room, { isPlaying: false });
      publish(room);
      io.to(room.id).emit('player:pause', { currentTime: getPlaybackState(room).currentTime });
      let summary;
      try {
        await finalizeArtistListening(room);
        summary = buildSessionSummary(room);
        await persistSession(room);
      }
      catch (error) {
        room.ending = false;
        console.error('Session save failed:', error.message);
        return callback?.({ success: false, error: 'Chưa lưu được tổng kết. Phòng vẫn được giữ, hãy thử Kết thúc lại.' });
      }
      io.to(room.id).emit('room:ended', summary);
      io.in(room.id).socketsLeave(room.id);
      deleteRoom(room.id);
      io.emit('rooms:updated');
      io.emit('leaderboard:updated');
      callback?.({ success: true, summary });
    });

    socket.on('player:play', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      // Anyone can play/pause
      cancelAutoplay(room);
      updatePlaybackState(room, { isPlaying: true, currentTime });
      prepareAudio(room);
      prepareArtists(room);
      io.to(room.id).emit('room:listeningTime', getListeningTime(room));
      rememberArtist(room, room.queue[room.currentIndex]);
      socket.to(room.id).emit('player:play', { currentTime });
    });

    socket.on('player:pause', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      // Anyone can pause
      cancelAutoplay(room);
      updatePlaybackState(room, { isPlaying: false, currentTime });
      io.to(room.id).emit('room:listeningTime', getListeningTime(room));
      io.to(room.id).emit('player:autoplayChanged', { autoplay: room.autoplay, autoplayLoading: false, autoplayError: '' });
      socket.to(room.id).emit('player:pause', { currentTime });
    });

    socket.on('player:seek', ({ currentTime }) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;

      cancelAutoplay(room);
      updatePlaybackState(room, { currentTime });
      socket.to(room.id).emit('player:seek', { currentTime });
    });

    for (const event of ['player:next', 'player:ended', 'player:errorSkip']) {
      socket.on(event, (payload = {}) => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.hostSocketId !== socket.id) return;
        const current = room.queue[room.currentIndex];
        if (!current || (payload.videoId && payload.videoId !== current.videoId)) return;
        advance(room, event === 'player:errorSkip');
      });
    }

    // --- QUEUE EVENTS ---

    socket.on('queue:autoAdd', async (callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false, error: 'Bạn chưa ở trong phòng.' });
      const result = await addAutomaticSong(room, socket.id, socket.user, {
        recommend, isCurrent: () => getRoom(room.id) === room,
      });
      if (result.success) {
        prepareAudio(room);
        io.to(room.id).emit('queue:updated', { queue: room.queue, currentIndex: room.currentIndex });
      }
      callback?.(result);
    });

    socket.on('queue:add', (song, callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ success: false });

      const newSong = {
        ...song,
        addedBy: socket.user.username,
        recommended: false,
      };

      const result = addToQueue(room, newSong, socket.user.userId);
      if (result === 'restricted') return callback?.({ success: false, error: 'Bạn đã bị hạn chế thêm nhạc' });
      if (!result) return callback?.({ success: false, error: 'Hàng đợi đã đầy' });
      prepareAudio(room);

      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });

      // If this is the first song, notify about song change
      if (room.queue.length === 1) {
        updatePlaybackState(room, { isPlaying: true, currentTime: 0 });
        prepareArtists(room);
        rememberArtist(room, room.queue[room.currentIndex]);
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
      prepareAudio(room);

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
      prepareAudio(room);

      io.to(room.id).emit('queue:updated', {
        queue: room.queue,
        currentIndex: room.currentIndex,
      });

      callback?.({ success: true });
    });

    // --- AUTOPLAY ---

    socket.on('player:toggleAutoplay', (callback) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return callback?.({ success: false });

      const autoplay = toggleAutoplay(room);
      if (!autoplay) cancelAutoplay(room);
      room.autoplayError = '';
      io.to(room.id).emit('player:autoplayChanged', { autoplay, autoplayLoading: room.autoplayLoading, autoplayError: '' });
      callback?.({ success: true, autoplay });
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

    socket.on('chat:message', ({ text, replyToId } = {}) => {
      const room = findRoomBySocket(socket.id);
      if (!room || typeof text !== 'string' || !text.trim()) return;

      const original = typeof replyToId === 'string' ? room.messages.find(message => message.id === replyToId) : null;

      const message = {
        id: randomUUID(),
        userId: String(socket.user.userId),
        hearts: [],
        username: socket.user.username,
        isAdmin: !!socket.user.isAdmin,
        text: text.trim().slice(0, 500),
        replyTo: original ? { id: original.id, username: original.username, text: original.text } : null,
        timestamp: Date.now(),
      };

      room.messages.push(message);
      // Keep only last 200 messages
      if (room.messages.length > 200) {
        room.messages = room.messages.slice(-200);
      }
      changed();

      io.to(room.id).emit('chat:message', message);
    });

    for (const action of ['edit', 'delete', 'heart']) {
      socket.on(`chat:${action}`, (payload = {}, callback) => {
        const reply = result => { if (typeof callback === 'function') callback(result); };
        const room = findRoomBySocket(socket.id);
        const message = room?.messages.find(item => item.id === payload?.messageId);
        if (!message) return reply({ success: false, error: 'Tin nhắn không còn tồn tại.' });
        const userId = String(socket.user.userId);
        if (action !== 'heart' && message.userId !== userId) {
          return reply({ success: false, error: 'Bạn chỉ có thể sửa hoặc xóa tin nhắn của mình.' });
        }
        if (action === 'heart') {
          if (typeof payload.liked !== 'boolean') return reply({ success: false, error: 'Thao tác không hợp lệ.' });
          const hearts = new Set(message.hearts || []);
          if (payload.liked) hearts.add(userId); else hearts.delete(userId);
          message.hearts = [...hearts];
        } else if (action === 'edit') {
          if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.trim().length > 500) {
            return reply({ success: false, error: 'Tin nhắn cần từ 1 đến 500 ký tự.' });
          }
          message.text = payload.text.trim();
          message.editedAt = Date.now();
          for (const item of room.messages) if (item.replyTo?.id === message.id) item.replyTo.text = message.text;
        } else {
          room.messages = room.messages.filter(item => item.id !== message.id);
          for (const item of room.messages) if (item.replyTo?.id === message.id) {
            item.replyTo = { ...item.replyTo, text: '', deleted: true };
          }
        }
        changed();
        io.to(room.id).emit('chat:updated', { messages: room.messages });
        reply({ success: true });
      });
    }

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
  if (!room.members.size) cancelAutoplay(room);

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
