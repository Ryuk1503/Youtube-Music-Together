const express = require('express');
const { getAllRooms, getRoom } = require('../utils/roomManager');

const router = express.Router();

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
