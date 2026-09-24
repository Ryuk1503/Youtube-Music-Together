const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../config/db');

function initMusicHistory(database) {
  return database.query(fs.readFileSync(path.join(__dirname, '../config/musicHistory.sql'), 'utf8'));
}

async function saveSongMetadata(id, data, database = pool) {
  const title = typeof data.track === 'string' ? data.track.trim() : '';
  const duration = Number(data.duration);
  await database.query(`INSERT INTO music_songs(video_id, raw_title, song_title, title_source, artist, duration_seconds, thumbnail_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(video_id) DO UPDATE SET
    raw_title=EXCLUDED.raw_title,
    song_title=CASE WHEN music_songs.title_source='manual' THEN music_songs.song_title ELSE COALESCE(EXCLUDED.song_title,music_songs.song_title) END,
    title_source=CASE WHEN music_songs.title_source='manual' THEN 'manual' ELSE COALESCE(EXCLUDED.title_source,music_songs.title_source) END,
    artist=COALESCE(EXCLUDED.artist,music_songs.artist), duration_seconds=COALESCE(EXCLUDED.duration_seconds,music_songs.duration_seconds),
    thumbnail_url=COALESCE(EXCLUDED.thumbnail_url,music_songs.thumbnail_url), updated_at=NOW()`,
  [id, String(data.title || id), title || null, title ? 'metadata' : null,
    data.artist || data.uploader || null, duration > 0 && duration < 604800 ? duration : null, data.thumbnail || null]);
}

async function savePlayback({ playbackId, song, sessionId, listenedMs, duration }, database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query(`INSERT INTO music_songs(video_id,raw_title,artist,duration_seconds,thumbnail_url) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(video_id) DO UPDATE SET duration_seconds=COALESCE(EXCLUDED.duration_seconds,music_songs.duration_seconds),updated_at=NOW()`,
    [song.videoId, song.title || song.videoId, song.author || null, duration || null, song.thumbnail || null]);
    await client.query(`INSERT INTO music_playbacks(playback_id,video_id,room_session_id,listened_ms)
      VALUES($1,$2,$3,$4) ON CONFLICT(playback_id) DO UPDATE SET
      listened_ms=GREATEST(music_playbacks.listened_ms,EXCLUDED.listened_ms),last_heard_at=NOW()
      WHERE music_playbacks.video_id=EXCLUDED.video_id AND music_playbacks.room_session_id=EXCLUDED.room_session_id`,
    [playbackId, song.videoId, sessionId, listenedMs]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Each room serializes writes and retains checkpoints across socket reconnects.
function createHistoryRecorder(save = savePlayback, now = Date.now) {
  let busy = false;
  const pending = new Map();
  const progress = new Map();
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (pending.size) {
        const [key, entry] = pending.entries().next().value;
        pending.delete(key);
        try { await save(entry); }
        catch { console.error('[music:history] write failed; next heartbeat will retry'); }
      }
    } finally { busy = false; }
  }
  return (room, user, payload) => {
    const song = room?.queue[room.currentIndex];
    if (!song || !payload || payload.videoId !== song.videoId ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(payload.playbackId) ||
      !Number.isSafeInteger(payload.listenedMs) || payload.listenedMs < 0 || payload.listenedMs > 86400000) return;
    const time = now();
    const key = `${user.userId}:${payload.playbackId}`;
    const previous = progress.get(key);
    if (previous && (previous.videoId !== song.videoId || previous.sessionId !== room.sessionId ||
      payload.listenedMs < previous.total || payload.listenedMs - previous.total > time - previous.at + 5000)) return;
    if (!previous && payload.listenedMs > 30000) return;
    progress.set(key, { videoId: song.videoId, sessionId: room.sessionId, total: payload.listenedMs, at: time });
    if (progress.size > 500) progress.delete(progress.keys().next().value);
    const duration = Number(payload.duration);
    pending.set(key, {
      playbackId: payload.playbackId, song: { ...song }, sessionId: room.sessionId,
      listenedMs: payload.listenedMs, duration: duration > 0 && duration < 604800 ? duration : null });
    if (pending.size > 100) pending.delete(pending.keys().next().value);
    void drain();
  };
}
module.exports = { initMusicHistory, saveSongMetadata, savePlayback, createHistoryRecorder };
