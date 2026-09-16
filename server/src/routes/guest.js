const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.post('/', (req, res) => {
  const displayName = String(req.body.displayName || '').trim();

  if (displayName.length < 1 || displayName.length > 30) {
    return res.status(400).json({ error: 'Tên hiển thị phải dài từ 1 đến 30 ký tự' });
  }

  const guest = {
    id: uuidv4(),
    username: displayName,
  };
  const token = jwt.sign(
    { userId: guest.id, username: guest.username, type: 'guest' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );

  res.status(201).json({ guest, token });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Guest session required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'guest') {
      return res.status(403).json({ error: 'Invalid guest session' });
    }
    res.json({ guest: { id: decoded.userId, username: decoded.username } });
  } catch {
    res.status(403).json({ error: 'Guest session expired' });
  }
});

module.exports = router;
