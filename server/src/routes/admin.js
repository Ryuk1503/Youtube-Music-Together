const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const intInRange = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : fallback;
};

router.get('/accounts', async (req, res) => {
  const limit = intInRange(req.query.limit, 10, 1, 500);
  const offset = intInRange(req.query.offset, 0, 0, 1e9);
  try {
    const total = (await pool.query('SELECT count(*)::int AS total FROM accounts')).rows[0].total;
    const { rows } = await pool.query(
      `SELECT a.id, a.username, a.public_id, a.created_at, COALESCE(p.notes, 0)::text AS notes
       FROM accounts a LEFT JOIN account_profiles p ON p.id = a.id
       ORDER BY a.created_at, a.public_id LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json({ total, accounts: rows });
  } catch { res.status(503).json({ error: 'Chưa tải được danh sách tài khoản.' }); }
});

router.get('/accounts/:userId/profile', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.username AS display_name, a.is_admin,
       COALESCE(p.bio,'') AS bio, COALESCE(p.avatar_url,'') AS avatar_url,
       COALESCE(p.cover_url,'') AS cover_url, COALESCE(p.notes,0)::text AS notes
       FROM accounts a LEFT JOIN account_profiles p ON p.id=a.id WHERE a.id=$1`, [req.params.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy hồ sơ.' });
    res.json({ profile: rows[0] });
  } catch { res.status(503).json({ error: 'Chưa tải được hồ sơ. Vui lòng thử lại.' }); }
});

router.get('/room-history', async (req, res) => {
  const limit = intInRange(req.query.limit, 5, 1, 200);
  try {
    const { rows } = await pool.query(
      `SELECT session_id, room_id, room_name, owner_name, opened_at, closed_at, close_reason, members
       FROM room_history ORDER BY opened_at DESC, session_id LIMIT $1`, [limit]);
    res.json({ sessions: rows });
  } catch { res.status(503).json({ error: 'Chưa tải được lịch sử phòng.' }); }
});

module.exports = router;
