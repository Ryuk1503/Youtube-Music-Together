const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { initAccounts } = require('./accounts');
const { persistNoteRewards } = require('./noteRewards');

test('Notes database: threshold, remainder, restart, unlimited rewards, concurrent/idempotent writes, rollback', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = 'notes_test_' + Date.now();
  const config = { connectionString: process.env.TEST_DATABASE_URL, ssl: { rejectUnauthorized: true } };
  const admin = new Pool(config);
  let db;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({ ...config, options: `-c search_path=${schema}` });
    await initAccounts(db);
    const id = randomUUID();
    await db.query('INSERT INTO accounts(id,username,name_key,public_id,password_hash) VALUES($1,$2,$2,$2,$2)', [id, 'reward-test']);
    await db.query('INSERT INTO account_profiles(id,display_name,notes) VALUES($1,$2,999)', [id, 'Reward test']);
    const batch = ms => ({ id: randomUUID(), entries: [{ accountId: id, elapsedMs: ms }] });
    const state = async () => (await db.query('SELECT notes, remainder_ms FROM account_profiles p JOIN account_note_progress r ON r.account_id=p.id WHERE p.id=$1', [id])).rows[0];
    await persistNoteRewards(db, batch(599999));
    assert.deepEqual(await state(), { notes: '999', remainder_ms: '599999' });
    const threshold = batch(1);
    await Promise.all([persistNoteRewards(db, threshold), persistNoteRewards(db, threshold)]);
    assert.deepEqual(await state(), { notes: '1000', remainder_ms: '0' });
    await db.end(); // Progress survives a fresh database connection/process.
    db = new Pool({ ...config, options: `-c search_path=${schema}` });
    await Promise.all([persistNoteRewards(db, batch(300000)), persistNoteRewards(db, batch(300000))]);
    assert.deepEqual(await state(), { notes: '1001', remainder_ms: '0' });
    await persistNoteRewards(db, batch(600000 * 100 + 123));
    assert.deepEqual(await state(), { notes: '1101', remainder_ms: '123' });
    const invalid = batch(-1);
    await assert.rejects(persistNoteRewards(db, invalid));
    assert.deepEqual(await state(), { notes: '1101', remainder_ms: '123' });
    assert.equal((await db.query('SELECT count(*) FROM account_note_rewards WHERE batch_id=$1', [invalid.id])).rows[0].count, '0');
    assert.equal((await db.query('SELECT sum(awarded_notes) AS sum FROM account_note_rewards')).rows[0].sum, '102');
    await db.query('UPDATE account_profiles SET fixed_notes=999 WHERE id=$1', [id]);
    for (const delta of [1234, -5000]) {
      await db.query('UPDATE account_profiles SET notes=notes+$2 WHERE id=$1', [id, delta]);
      assert.equal((await state()).notes, '999');
    }
    const ignored = batch(600000);
    assert.deepEqual(await persistNoteRewards(db, ignored), []);
    assert.equal((await state()).notes, '999');
    assert.equal((await db.query('SELECT count(*) FROM account_note_rewards WHERE batch_id=$1', [ignored.id])).rows[0].count, '0');
    await db.query('UPDATE accounts SET username=$2, public_id=$2 WHERE id=$1', [id, 'renamed']);
    await db.query('UPDATE account_profiles SET notes=0, bio=$2 WHERE id=$1', [id, 'Changed bio']);
    assert.equal((await state()).notes, '999');
    assert.equal((await db.query('SELECT bio FROM account_profiles WHERE id=$1', [id])).rows[0].bio, 'Changed bio');
  } finally {
    await db?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
