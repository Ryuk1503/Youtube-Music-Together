const { pool } = require('../config/db');

async function initRoomHistory(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS room_history (
      session_id UUID PRIMARY KEY,
      room_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      owner_user_id TEXT,
      owner_name TEXT NOT NULL,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      close_reason TEXT,
      members JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE INDEX IF NOT EXISTS room_history_opened_idx ON room_history(opened_at DESC);
  `);
  // Keep only the five most recent sessions; the admin page never shows more.
  await db.query(`DELETE FROM room_history WHERE session_id NOT IN (
    SELECT session_id FROM room_history ORDER BY opened_at DESC, session_id LIMIT 5)`);
}

function participantList(room) {
  return Array.from(room.participants || [], ([userId, username]) => ({ userId, username }));
}

function createRoomHistoryRecorder(database = pool) {
  const opened = room => database.query(
    'INSERT INTO room_history(session_id, room_id, room_name, owner_user_id, owner_name, opened_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT (session_id) DO NOTHING',
    [room.sessionId, room.id, room.name, room.ownerId == null ? null : String(room.ownerId), room.ownerName]
  );
  const closed = (room, reason) => database.query(
    'UPDATE room_history SET closed_at=now(), close_reason=$2, members=$3 WHERE session_id=$1 AND closed_at IS NULL',
    [room.sessionId, reason, JSON.stringify(participantList(room))]
  );
  return { opened, closed };
}

// Rooms live in memory, so a server restart silently drops any room that was
// open. Mark those rows closed so history never shows a room as "still open",
// except the rooms the snapshot brought back to life.
async function closeAbandonedRooms(database = pool, keepSessionIds = []) {
  const { rowCount } = await database.query(
    "UPDATE room_history SET closed_at=now(), close_reason='restart' WHERE closed_at IS NULL AND NOT (session_id = ANY($1::uuid[]))",
    [keepSessionIds]
  );
  return rowCount;
}

module.exports = { initRoomHistory, createRoomHistoryRecorder, closeAbandonedRooms, participantList };
