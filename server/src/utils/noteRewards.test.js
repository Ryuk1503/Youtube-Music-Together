const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNoteRewards } = require('./noteRewards');
const { observeListeningIntervals, getListeningTime } = require('./listeningTime');
const { createRoom, joinRoom, leaveRoom, deleteRoom, addToQueue, updatePlaybackState, kickMember } = require('./roomManager');

test('personal time follows room timer, excludes prior time/pauses, unions tabs and rooms, preserves leave/rejoin', async t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const rooms = [], batches = [];
  const rewards = createNoteRewards({ persist: async batch => { batches.push(batch); return []; }, sample: time => rooms.forEach(room => getListeningTime(room, time)) });
  observeListeningIntervals(rewards.record);
  t.after(() => { observeListeningIntervals(null); rooms.forEach(room => deleteRoom(room.id)); });
  function room(socket, user) {
    const value = createRoom({ name: 'Notes', host: { socketId: socket, userId: user } });
    rooms.push(value); joinRoom(value.id, socket, { userId: user });
    addToQueue(value, { videoId: 'song' }); updatePlaybackState(value, { isPlaying: true });
    return value;
  }
  const first = room('a', 'one');
  now = 100000; joinRoom(first.id, 'b', { userId: 'two' });
  joinRoom(first.id, 'a2', { userId: 'one' });
  const second = room('a3', 'one');
  now = 300000; updatePlaybackState(first, { isPlaying: false });
  now = 400000; leaveRoom(second.id, 'a3');
  now = 500000; updatePlaybackState(first, { isPlaying: true });
  now = 600000; kickMember(first, 'two');
  now = 700000; await rewards.flush();
  assert.deepEqual(Object.fromEntries(batches[0].entries.map(e => [e.accountId, e.elapsedMs])), { one: 600000, two: 300000 });
  leaveRoom(first.id, 'a'); leaveRoom(first.id, 'a2');
  now = 800000; joinRoom(first.id, 'new', { userId: 'two' });
  now = 850000; await rewards.flush();
  assert.deepEqual(batches[1].entries, [{ accountId: 'two', elapsedMs: 50000 }]);
});

test('failed batches retry same id, serialize concurrent flushes, and keep new listening intervals', async () => {
  let fail = true;
  const calls = [];
  const rewards = createNoteRewards({ sample() {}, persist: async batch => {
    calls.push(batch); if (fail) throw Error('db unavailable'); return [];
  } });
  const room = { members: new Map([['a', { userId: 'one' }]]) };
  rewards.record(room, 0, 599999);
  await assert.rejects(rewards.flush());
  rewards.record(room, 599999, 600000);
  fail = false;
  await Promise.all([rewards.flush(), rewards.flush()]);
  assert.equal(calls.length, 2); assert.equal(calls[0].id, calls[1].id);
  await rewards.flush();
  assert.equal(calls[2].entries[0].elapsedMs, 1);
  assert.notEqual(calls[2].id, calls[1].id);
});
