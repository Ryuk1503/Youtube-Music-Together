const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, addToQueue, deleteRoom } = require('./roomManager');
const { prepareQueueEnd, advanceRoom, cancelAutoplay, durationSeconds } = require('./autoplay');
function roomFor(t) {
  const room = createRoom({ name: 'early', host: { socketId: 'host', userId: 'user' } });
  room.members.set('host', {});
  addToQueue(room, { videoId: 'aaaaaaaaaaa', duration: '3:00' });
  room.isPlaying = true; room.currentTime = 169; room.lastSyncedAt = 1000;
  t.after(() => deleteRoom(room.id));
  return room;
}
const next = [{ videoId: 'bbbbbbbbbbb', duration: '4:00' }];
test('starts at ten seconds remaining, queues once, and leaves current playback intact', async t => {
  const room = roomFor(t); let requests = 0, notices = 0;
  const options = { now: 1000, recommend: async () => { requests++; return next; }, notify: () => notices++ };
  await prepareQueueEnd(room, options); assert.equal(requests, 0);
  await prepareQueueEnd(room, { ...options, now: 2000 });
  await prepareQueueEnd(room, { ...options, now: 3000 });
  assert.equal(requests, 1); assert.equal(notices, 1);
  assert.equal(room.queue.length, 2); assert.equal(room.currentIndex, 0);
  assert.equal(room.isPlaying, true); assert.equal(room.currentTime, 169);
  await advanceRoom(room, { notify: () => {}, recommend: () => assert.fail('already queued') });
  assert.equal(room.currentIndex, 1);
});
test('disabled, paused, empty, ending, unknown duration and non-final songs do not trigger', async t => {
  for (const change of [r => r.autoplay = false, r => r.isPlaying = false, r => r.members.clear(),
    r => r.ending = true, r => r.queue[0].duration = '', r => addToQueue(r, next[0])]) {
    const room = roomFor(t); change(room);
    await prepareQueueEnd(room, { now: 2000, recommend: () => assert.fail('not eligible') });
  }
});
test('manual additions, cancellation, room deletion and song changes discard a late recommendation', async t => {
  for (const change of [r => addToQueue(r, { videoId: 'ccccccccccc' }), cancelAutoplay,
    r => r.members.clear(), r => r.ending = true, r => r.autoplay = false,
    r => r.queue[0] = { videoId: 'ddddddddddd' }]) {
    const room = roomFor(t); let resolve;
    const pending = prepareQueueEnd(room, { now: 2000, recommend: () => new Promise(r => resolve = r) });
    await Promise.resolve(); change(room); resolve(next); await pending;
    assert.ok(!room.queue.some(song => song.videoId === 'bbbbbbbbbbb'));
  }
  const room = roomFor(t);
  await prepareQueueEnd(room, { now: 2000, recommend: async () => next, isCurrent: () => false });
  assert.equal(room.queue.length, 1);
});
test('track ending during preparation shares the request and advances exactly once', async t => {
  const room = roomFor(t); let resolve; let requests = 0;
  const recommend = () => { requests++; return new Promise(r => resolve = r); };
  const early = prepareQueueEnd(room, { now: 2000, recommend });
  await Promise.resolve();
  const advance = advanceRoom(room, { recommend, notify: () => {} });
  await advanceRoom(room, { recommend, notify: () => {} });
  resolve(next); await Promise.all([early, advance]);
  assert.equal(requests, 1); assert.equal(room.queue.length, 2); assert.equal(room.currentIndex, 1);
});
test('preparation failure does not loop and normal end-of-track fallback retries', async t => {
  const room = roomFor(t); let attempts = 0;
  const options = { now: 2000, recommend: async () => { attempts++; throw Error('offline'); } };
  await prepareQueueEnd(room, options); await prepareQueueEnd(room, options);
  assert.equal(attempts, 1); assert.equal(room.isPlaying, true);
  await advanceRoom(room, { notify: () => {}, recommend: async () => next });
  assert.equal(room.currentIndex, 1);
});
test('actual host duration overrides card duration and duration parsing rejects live labels', async t => {
  assert.equal(durationSeconds('1:02:03'), 3723);
  assert.equal(durationSeconds('LIVE'), 0);
  assert.equal(durationSeconds('2:99'), 0);
  const room = roomFor(t);
  room.audioClock = { song: room.queue[0], duration: 200 };
  await prepareQueueEnd(room, { now: 2000, recommend: () => assert.fail('20 seconds too early') });
  await prepareQueueEnd(room, { now: 22000, recommend: async () => next });
  assert.equal(room.queue.length, 2);
});
