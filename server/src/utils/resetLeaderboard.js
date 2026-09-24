const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { saveResetBackup } = require('./resetBackup');

async function resetListeningData(database = pool, backup = saveResetBackup) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('LOCK TABLE listening_sessions, session_artist_listening, music_songs, music_playbacks IN ACCESS EXCLUSIVE MODE');
    const sessions = (await client.query('SELECT * FROM listening_sessions ORDER BY id')).rows;
    const artists = (await client.query('SELECT * FROM session_artist_listening ORDER BY session_id, artist_key')).rows;
    const songs = (await client.query('SELECT * FROM music_songs ORDER BY video_id')).rows;
    const playbacks = (await client.query('SELECT * FROM music_playbacks ORDER BY playback_id')).rows;
    await backup({ version: 2, savedAt: new Date().toISOString(), listening_sessions: sessions, session_artist_listening: artists,
      music_songs: songs, music_playbacks: playbacks });
    await client.query('TRUNCATE TABLE session_artist_listening, listening_sessions, music_playbacks, music_songs');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function createResetHandler({ reset = resetListeningData, hash = () => process.env.DATABASE_RESET_PASSWORD_HASH, now = Date.now } = {}) {
  const attempts = new Map();
  let busy = false;
  return async (req, res) => {
    const current = now();
    for (const [key, value] of attempts) if (value.until <= current) attempts.delete(key);
    const key = req.ip || 'unknown';
    const bucket = attempts.get(key) || { count: 0, until: current + 15 * 60 * 1000 };
    if (bucket.count >= 5 || (!attempts.has(key) && attempts.size >= 1000)) {
      return res.status(429).json({ error: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
    }
    if (!hash()) return res.status(503).json({ error: 'Chức năng xóa chưa được cấu hình.' });
    bucket.count++;
    attempts.set(key, bucket);
    const password = req.body?.password;
    try {
      if (typeof password !== 'string' || password.length > 72 || !await bcrypt.compare(password, hash())) {
        return res.status(403).json({ error: 'Mật khẩu không đúng.' });
      }
      if (busy) return res.status(409).json({ error: 'Đang xóa dữ liệu. Vui lòng chờ.' });
      busy = true;
      try {
        await reset();
        attempts.delete(key);
        req.app?.get('io')?.emit('leaderboard:updated');
        return res.json({ success: true });
      } finally { busy = false; }
    } catch {
      return res.status(503).json({ error: 'Chưa xóa được dữ liệu. Vui lòng thử lại.' });
    }
  };
}
module.exports = { createResetHandler, resetListeningData };
