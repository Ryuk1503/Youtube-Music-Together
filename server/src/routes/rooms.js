const express = require('express');
const { getAllRooms, getRoom } = require('../utils/roomManager');

const router = express.Router();
const { createResetHandler } = require('../utils/resetLeaderboard');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { pool } = require('../config/db');
router.get('/:roomId/members/:userId/profile', authenticateToken, async (req,res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({error:'Phòng không còn tồn tại.'});
  const members = Array.from(room.members.values());
  if (!members.some(member => member.userId === req.user.userId)) return res.status(403).json({error:'Bạn cần ở trong phòng để xem hồ sơ.'});
  if (!members.some(member => member.userId === req.params.userId)) return res.status(404).json({error:'Thành viên đã rời phòng.'});
  try {
    const { rows } = await pool.query(`SELECT a.id, a.username AS display_name, a.public_id, a.is_admin,
      COALESCE(p.bio,'') AS bio, COALESCE(p.avatar_url,'') AS avatar_url,
      COALESCE(p.cover_url,'') AS cover_url, COALESCE(p.notes,0)::text AS notes
      FROM accounts a LEFT JOIN account_profiles p ON p.id=a.id WHERE a.id=$1`, [req.params.userId]);
    if (!rows[0]) return res.status(404).json({error:'Không tìm thấy hồ sơ.'});
    res.set('Cache-Control','no-store').json({profile:rows[0]});
  } catch { res.status(503).json({error:'Chưa tải được hồ sơ. Vui lòng thử lại.'}); }
});
router.post('/leaderboard/reset', authenticateToken, requireAdmin, createResetHandler());
const { getLeaderboard } = require('../utils/artistLeaderboard');
router.get('/leaderboard', async (req, res) => {
  try { res.json({ artists: await getLeaderboard() }); }
  catch { res.status(503).json({ error: 'Chưa tải được bảng xếp hạng.' }); }
});

// GET /api/rooms - List all rooms
router.get('/', (req, res) => {
  const rooms = getAllRooms();
  res.json({ rooms });
});

// GET /api/rooms/:id - Get room info (for checking password requirement)
router.get('/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    memberCount: room.members.size,
  });
});

module.exports = router;
