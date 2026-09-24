const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { initRoomHistory, createRoomHistoryRecorder, closeAbandonedRooms, participantList } = require('./roomHistory');

test('room history: open, close, duplicate writes ignored, restart recovery', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = 'room_history_' + Date.now();
  const config = { connectionString: process.env.TEST_DATABASE_URL, ssl: { rejectUnauthorized: true } };
  const admin = new Pool(config);
  let db;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({ ...config, options: `-c search_path=${schema}` });
    await initRoomHistory(db);
    const recorder = createRoomHistoryRecorder(db);
    assert.deepEqual(participantList({ participants: new Map([['id-1', 'Ryuk'], ['id-2', 'Khách']]) }), [
      { userId: 'id-1', username: 'Ryuk' }, { userId: 'id-2', username: 'Khách' },
    ]);
    assert.deepEqual(participantList({}), []);
    const room = {
      sessionId: '11111111-1111-4111-8111-111111111111', id: 'abcd1234', name: 'Phòng test',
      ownerId: 'd7d6fe17-3b15-4de1-b2ca-33d6fa414dc6', ownerName: 'Ryuk',
      participants: new Map([['d7d6fe17-3b15-4de1-b2ca-33d6fa414dc6', 'Ryuk'], ['id-2', 'Khách']]),
    };
    await recorder.opened(room);
    await recorder.opened(room); // same session reconnecting must not duplicate
    let rows = (await db.query('SELECT * FROM room_history')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].room_id, 'abcd1234');
    assert.equal(rows[0].room_name, 'Phòng test');
    assert.equal(rows[0].owner_name, 'Ryuk');
    assert.equal(rows[0].closed_at, null);
    await recorder.closed(room, 'ttl');
    await recorder.closed(room, 'ended'); // already closed, no-op
    rows = (await db.query('SELECT * FROM room_history')).rows;
    assert.equal(rows[0].close_reason, 'ttl');
    assert.notEqual(rows[0].closed_at, null);
    assert.deepEqual(rows[0].members, [
      { userId: 'd7d6fe17-3b15-4de1-b2ca-33d6fa414dc6', username: 'Ryuk' }, { userId: 'id-2', username: 'Khách' },
    ]);
    const guest = {
      sessionId: '22222222-2222-4222-8222-222222222222', id: 'zzzz9999', name: 'Phòng khách',
      ownerId: null, ownerName: 'Khách ẩn danh', participants: new Map(),
    };
    await recorder.opened(guest);
    assert.equal(await closeAbandonedRooms(db), 1); // only the still-open guest room
    rows = (await db.query('SELECT close_reason FROM room_history ORDER BY room_id')).rows;
    assert.deepEqual(rows.map(row => row.close_reason), ['ttl', 'restart']);
    assert.equal(await closeAbandonedRooms(db), 0);

    // A room the snapshot restored is still open, so it must not be closed as abandoned.
    const keepSession = '33333333-3333-4333-8333-333333333333';
    await recorder.opened({ ...guest, sessionId: keepSession, id: 'keep0000' });
    assert.equal(await closeAbandonedRooms(db, [keepSession]), 0);
    rows = (await db.query("SELECT closed_at, close_reason FROM room_history WHERE room_id = 'keep0000'")).rows;
    assert.equal(rows[0].closed_at, null);
    assert.equal(rows[0].close_reason, null);
    await recorder.closed({ sessionId: keepSession, id: 'keep0000', participants: new Map([['id-3', 'Khách']]) }, 'ttl');
    assert.equal((await db.query("SELECT members FROM room_history WHERE room_id = 'keep0000'")).rows[0].members.length, 1);
  } finally {
    await db?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
