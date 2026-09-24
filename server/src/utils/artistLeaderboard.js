const { pool } = require('../config/db');
const { summaryArtists } = require('./summaryArtists');

async function saveSession(room, database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const inserted = await client.query('INSERT INTO listening_sessions (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [room.sessionId]);
    if (inserted.rowCount) {
      for (const [key, artist] of room.artistListening || []) {
        const elapsed = Math.floor(artist.elapsedMs);
        if (elapsed > 0) await client.query(
          'INSERT INTO session_artist_listening (session_id, artist_key, artist_name, elapsed_ms) VALUES ($1, $2, $3, $4)',
          [room.sessionId, key, artist.name, elapsed]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function getLeaderboard(database = pool) {
  // One source of truth: persisted listening checkpoints, including ongoing rooms.
  const result = await database.query(`
    SELECT s.artist, SUM(p.listened_ms)::text AS elapsed
    FROM music_playbacks p JOIN music_songs s USING(video_id)
    WHERE p.listened_ms > 0 AND s.artist IS NOT NULL
    GROUP BY s.artist
  `);
  const totals = new Map();
  for (const row of result.rows) {
    const artists = new Map();
    // Explicit featuring credits count for each artist; preserve band ampersands.
    for (const name of row.artist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/iu)) {
      for (const artist of summaryArtists({ author: name, channelNames: [name], title: '' })) artists.set(artist.key, artist);
    }
    for (const artist of artists.values()) {
      const total = totals.get(artist.key) || { ...artist, elapsedMs: 0 };
      total.elapsedMs += Number(row.elapsed);
      totals.set(artist.key, total);
    }
  }
  return [...totals.values()].sort((a, b) => b.elapsedMs - a.elapsedMs || a.key.localeCompare(b.key)).slice(0, 3);
}
module.exports = { saveSession, getLeaderboard };
