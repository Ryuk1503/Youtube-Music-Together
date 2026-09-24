const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: true },
});

const initDB = async () => {
  let client;
  try {
    client = await pool.connect();
    await require('../utils/accounts').initAccounts(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS listening_sessions (
        id UUID PRIMARY KEY,
        ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS session_artist_listening (
        session_id UUID NOT NULL REFERENCES listening_sessions(id) ON DELETE CASCADE,
        artist_key TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms > 0),
        PRIMARY KEY (session_id, artist_key)
      );
    `);
    await require('../utils/musicHistory').initMusicHistory(client);
    await require('../utils/roomHistory').initRoomHistory(client);
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
};

module.exports = { pool, initDB };
