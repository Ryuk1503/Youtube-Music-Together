const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken, publicUser: guestView } = require('../middleware/auth');
const router = express.Router();
const nameKey = name => name.normalize('NFKC').toLocaleLowerCase('vi');
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
router.use(authenticateToken);
router.get('/me', (req,res) => res.json({guest:guestView(req.account)}));
router.get('/profile', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT display_name, bio, avatar_url, cover_url, notes::text FROM account_profiles WHERE id=$1', [req.user.userId]);
  res.json({ profile: { ...(rows[0] || { bio: '', avatar_url: '', cover_url: '', notes: '0' }), display_name: req.account.username, public_id: req.account.public_id, is_admin: req.account.is_admin } });
}));
router.patch('/profile', asyncRoute(async (req, res) => {
  const { field, value } = req.body;
  const limits = { display_name: 30, bio: 500, avatar_url: 90000, cover_url: 90000 };
  if (!Object.hasOwn(limits, field) || typeof value !== 'string' || value.trim().length > limits[field] || (field === 'display_name' && (!value.trim() || /[\p{Cc}\p{Cf}]/u.test(value)))) {
    return res.status(400).json({ error: 'Thông tin hồ sơ không hợp lệ.' });
  }
  if (['avatar_url', 'cover_url'].includes(field) && value.trim()) {
    const image = value.trim();
    const match = image.match(/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/);
    const bytes = match && Buffer.from(match[1], 'base64');
    const validUpload = bytes && bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!validUpload) {
      try { const url = new URL(image); if (image.length > 2000 || url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
      catch { return res.status(400).json({ error: 'Ảnh không hợp lệ. Hãy chọn lại ảnh JPG, PNG hoặc WebP.' }); }
    }
  }
  // Only allowlisted columns are interpolated; the balance cannot be edited here.
  if (field === 'display_name') {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query('UPDATE accounts SET username=$1,name_key=$2,updated_at=now() WHERE id=$3 RETURNING *', [value.trim(),nameKey(value.trim()),req.user.userId]);
      await db.query('UPDATE account_profiles SET display_name=$1,updated_at=now() WHERE id=$2', [value.trim(),req.user.userId]);
      await db.query("INSERT INTO account_events(account_id,event) VALUES($1,'profile_name_changed')", [req.user.userId]);
      await db.query('COMMIT');
      const p = await pool.query('SELECT bio,avatar_url,cover_url,notes::text FROM account_profiles WHERE id=$1', [req.user.userId]);
      const account = result.rows[0];
      const io = req.app.get('io');
      if (io) {
        const { findRoomBySocket } = require('../utils/roomManager');
        for (const socket of io.sockets.sockets.values()) {
          if (socket.user?.userId !== account.id) continue;
          socket.user.username = account.username;
          const room = findRoomBySocket(socket.id);
          const member = room?.members.get(socket.id);
          if (member) {
            member.username = account.username;
            io.to(room.id).emit('member:listUpdated', { members: Array.from(room.members.values()), restricted: Array.from(room.restricted) });
          }
        }
      }
      return res.json({ guest: guestView(account), profile: { ...(p.rows[0] || { bio:'',avatar_url:'',cover_url:'',notes:'0' }), display_name:account.username,public_id:account.public_id,is_admin:account.is_admin } });
    } catch(error) { await db.query('ROLLBACK'); if(error.code==='23505') return res.status(409).json({error:'Tên này đã được sử dụng. Hãy chọn tên khác.'}); throw error; }
    finally { await db.query('ROLLBACK'); db.release(); }
  }
  const { rows } = await pool.query(`INSERT INTO account_profiles (id, display_name, ${field === 'display_name' ? 'bio' : field})
    VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET ${field}=$4,updated_at=now()
    RETURNING display_name, bio, avatar_url, cover_url, notes::text`,
    [req.user.userId, field === 'display_name' ? value.trim() : req.user.username, field === 'display_name' ? '' : value.trim(), value.trim()]);
  res.json({ profile: { ...rows[0], display_name:req.account.username, public_id:req.account.public_id, is_admin:req.account.is_admin } });
}));
router.use((error,req,res,next)=>{res.status(error.status||503).json({error:'Chưa thể cập nhật hồ sơ. Vui lòng thử lại.'});});
module.exports=router;
