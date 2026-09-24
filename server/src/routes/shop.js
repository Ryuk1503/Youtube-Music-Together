const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { ID_CARD, shopAction } = require('../utils/shop');
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(authenticateToken);
router.get('/', wrap(async (req, res) => {
  const wallet = (await pool.query('SELECT notes FROM account_profiles WHERE id=$1', [req.account.id])).rows[0];
  res.json({ items: [ID_CARD], notes: wallet.notes });
}));
router.get('/inventory', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT item_id,quantity FROM account_inventory WHERE account_id=$1 AND quantity>0', [req.account.id]);
  res.json({ publicId: req.account.public_id, items: rows.filter(row => row.item_id === ID_CARD.id).map(row => ({ ...ID_CARD, quantity: row.quantity })) });
}));
for (const action of ['buy', 'use']) router.post('/' + action, wrap(async (req, res) => {
  const result = await shopAction(pool, req.account.id, { ...req.body, action });
  const io = req.app.get('io');
  if (!result.replayed && io) {
    for (const socket of io.sockets.sockets.values()) if (socket.user?.userId === req.account.id) {
      socket.emit('inventory:updated');
      if (action === 'buy') socket.emit('notes:updated', { userId: req.account.id, notes: result.notes });
      else socket.emit('account:idUpdated', { publicId: result.publicId });
    }
  }
  res.json(result);
}));
router.use((error, req, res, next) => {
  if (!error.status) console.error('Shop request failed:', error.message);
  res.status(error.status || 503).json({ error: error.status ? error.message : 'Chưa thể thực hiện. Vui lòng thử lại.' });
});
module.exports = router;
