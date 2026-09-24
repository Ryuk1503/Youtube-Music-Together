require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const { initDB } = require('./config/db');
const { setupSocket } = require('./socket/handler');
const { createRoomHistoryRecorder, closeAbandonedRooms } = require('./utils/roomHistory');
const { csrfGuard, allowedSocketRequest } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const youtubeRoutes = require('./routes/youtube');
const guestRoutes = require('./routes/guest');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];
// In production, allow the Render URL
if (process.env.RENDER_EXTERNAL_URL) {
  allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
}
if (process.env.APP_URL) {
  allowedOrigins.push(new URL(process.env.APP_URL).origin);
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 100000,
  allowRequest: (req, callback) => callback(null, allowedSocketRequest(req.headers)),
});

// Middleware
app.set('io', io);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use((req,res,next) => {
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','no-referrer');
  res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-src https://www.youtube.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(process.env.NODE_ENV==='production')res.set('Strict-Transport-Security','max-age=31536000');
  next();
});
app.use('/api', csrfGuard);
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/guest', guestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shop', require('./routes/shop'));
app.use('/api/announcements', require('./routes/announcements'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});
app.use('/api', (req,res) => res.status(404).json({error:'API not found'}));

// Socket.IO
setupSocket(io, { roomHistory: createRoomHistoryRecorder() });

// Serve built client in production
const clientDist = path.join(__dirname, '../public');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  const indexPath = path.join(clientDist, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Run: cd ../client && npm install && npm run build --outDir ../server/public');
  }
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || process.env.IP || '0.0.0.0';

async function start() {
  await initDB();
  const { pool } = require('./config/db');
  const { getAllRooms, getRoom, snapshotRooms, restoreRooms, observeRoomChanges } = require('./utils/roomManager');
  const { restoreRoomsFromDisk, createRoomSnapshotter } = require('./utils/roomPersistence');

  // Bring back the rooms the snapshot holds before anyone can connect: clients
  // rejoin on their own, so a restart no longer ends a listening session.
  const roomHistory = createRoomHistoryRecorder();
  const restored = restoreRooms(restoreRoomsFromDisk());
  for (const room of restored) {
    room.onClosed = (closedRoom, reason) => {
      roomHistory.closed(closedRoom, reason).catch(error => console.error('Room history close failed:', error.message));
    };
    roomHistory.opened(room).catch(error => console.error('Room history open failed:', error.message));
  }
  if (restored.length) console.log(`♻️ Restored ${restored.length} room(s) from the last snapshot`);
  closeAbandonedRooms(pool, restored.map(room => room.sessionId)).catch(error => console.error('Room history recovery failed:', error.message));

  const snapshotter = createRoomSnapshotter({ snapshot: snapshotRooms });
  observeRoomChanges(() => snapshotter.schedule());
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => snapshotter.flush());
  server.once('close', () => snapshotter.stop());

  const { getListeningTime, observeListeningIntervals } = require('./utils/listeningTime');
  const { createNoteRewards, persistNoteRewards } = require('./utils/noteRewards');
  const rewards = createNoteRewards({
    persist: batch => persistNoteRewards(pool, batch),
    sample: now => { for (const { id } of getAllRooms()) getListeningTime(getRoom(id), now); },
    notify: update => {
      for (const { id } of getAllRooms()) {
        if ([...getRoom(id).members.values()].some(member => member.userId === update.userId)) {
          io.to(id).emit('notes:updated', update);
        }
      }
      for (const socket of io.sockets.sockets.values()) {
        if (socket.user?.userId === update.userId) socket.emit('notes:updated', update);
      }
    },
  });
  observeListeningIntervals(rewards.record);
  const rewardTimer = setInterval(() => {
    rewards.flush().catch(error => console.error('Notes save failed; will retry:', error.message));
  }, 5000);
  rewardTimer.unref();
  server.once('close', () => { clearInterval(rewardTimer); observeListeningIntervals(null); });
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start().catch(() => { console.error('Startup aborted: database unavailable'); process.exit(1); });
