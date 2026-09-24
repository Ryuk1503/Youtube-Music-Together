const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, content, sender, created_at FROM system_announcements ORDER BY created_at DESC, id DESC LIMIT 50`
    );
    res.json({ announcements: rows });
  } catch (err) {
    res.status(500).json({ error: 'Chưa tải được danh sách thư.' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const sender = typeof req.body.sender === 'string' && req.body.sender.trim() ? req.body.sender.trim() : 'Ban Quản Trị';
  if (!title || !content) {
    return res.status(400).json({ error: 'Tiêu đề và nội dung không được để trống.' });
  }
  if (title.length > 200 || content.length > 5000 || sender.length > 100) {
    return res.status(400).json({ error: 'Nội dung vượt quá độ dài cho phép.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO system_announcements (title, content, sender) VALUES ($1, $2, $3) RETURNING id, title, content, sender, created_at`,
      [title, content, sender]
    );
    const announcement = rows[0];
    const io = req.app.get('io');
    io?.emit('announcement:new', announcement);
    res.json({ success: true, announcement });
  } catch (err) {
    res.status(500).json({ error: 'Không thể gửi thông báo.' });
  }
});

module.exports = router;
