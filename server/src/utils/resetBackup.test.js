const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { saveResetBackup } = require('./resetBackup');
const { resetListeningData } = require('./resetLeaderboard');

test('keeps one compressed backup and replaces its contents on the next reset', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ytm-reset-test-'));
  try {
    await saveResetBackup({ session: 1 }, directory);
    await saveResetBackup({ session: 2 }, directory);
    assert.deepEqual(await fs.readdir(directory), ['database-reset.json.gz']);
    const saved = JSON.parse(gunzipSync(await fs.readFile(path.join(directory, 'database-reset.json.gz'))));
    assert.deepEqual(saved, { session: 2 });
    await assert.rejects(saveResetBackup({ invalid: 1n }, directory));
    assert.deepEqual(JSON.parse(gunzipSync(await fs.readFile(path.join(directory, 'database-reset.json.gz')))), { session: 2 });
  } finally {
    await fs.unlink(path.join(directory, 'database-reset.json.gz'));
    await fs.rmdir(directory);
  }
});

test('backs up all listening/catalog tables before deletion, rolls back if backup fails', async () => {
  for (const fail of [false, true]) {
    const actions = [];
    const database = { connect: async () => ({
      async query(sql) { actions.push(sql); return { rows: [{ id: 'test' }] }; },
      release() { actions.push('release'); },
    }) };
    const task = resetListeningData(database, async snapshot => {
      assert.equal(snapshot.listening_sessions.length, 1);
      assert.equal(snapshot.session_artist_listening.length, 1);
      assert.equal(snapshot.music_songs.length, 1);
      assert.equal(snapshot.music_playbacks.length, 1);
      actions.push('backup');
      if (fail) throw Error('Disk full');
    });
    if (fail) {
      await assert.rejects(task, /Disk full/);
      assert.ok(!actions.some(a => a.startsWith('TRUNCATE')));
      assert.ok(actions.includes('ROLLBACK'));
    } else {
      await task;
      assert.ok(actions.indexOf('backup') < actions.findIndex(a => a.startsWith('TRUNCATE')));
      assert.ok(actions.findIndex(a => a.startsWith('LOCK TABLE')) < actions.findIndex(a => a.startsWith('SELECT')));
      assert.ok(actions.includes('COMMIT'));
      assert.ok(actions.find(a => a.startsWith('TRUNCATE')).includes('music_playbacks, music_songs'));
    }
    assert.equal(actions.at(-1), 'release');
  }
});
