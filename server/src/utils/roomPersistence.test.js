const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { restoreRoomsFromDisk, createRoomSnapshotter } = require('./roomPersistence');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-rooms-')), 'rooms.json');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('restoring without a snapshot file yields no rooms', () => {
  assert.deepEqual(restoreRoomsFromDisk(tempFile()), []);
  const broken = tempFile();
  fs.writeFileSync(broken, '{"rooms":');
  assert.deepEqual(restoreRoomsFromDisk(broken), []);
});

test('snapshotter debounces changes, skips identical writes and flushes on demand', async () => {
  const file = tempFile();
  const rooms = [{ id: 'abcd1234', sessionId: 's-1', queue: [] }];
  let calls = 0;
  const snapshotter = createRoomSnapshotter({ file, snapshot: () => (calls++, rooms), debounceMs: 5, intervalMs: 60000 });
  try {
    assert.deepEqual(restoreRoomsFromDisk(file), []);
    snapshotter.schedule();
    snapshotter.schedule(); // debounce collapses both into a single write
    await wait(50);
    const first = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(calls, 1);
    assert.deepEqual(first.rooms, rooms);

    // Unchanged state must not rewrite the file (savedAt would move).
    snapshotter.flush();
    assert.equal(calls, 2);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).savedAt, first.savedAt);

    rooms.push({ id: 'efgh5678', sessionId: 's-2', queue: [] });
    snapshotter.schedule();
    await wait(50);
    assert.equal(restoreRoomsFromDisk(file).length, 2);
  } finally {
    snapshotter.stop();
  }
});

test('a failing snapshot keeps the previous file and only logs', () => {
  const file = tempFile();
  const snapshotter = createRoomSnapshotter({
    file, debounceMs: 5, intervalMs: 60000,
    snapshot: () => { throw new Error('rooms unavailable'); },
  });
  try {
    snapshotter.flush();
    assert.deepEqual(restoreRoomsFromDisk(file), []);
  } finally {
    snapshotter.stop();
  }
});
