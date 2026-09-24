const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, getRoom, joinRoom, leaveRoom, deleteRoom, addToQueue, updatePlaybackState, restrictMember, snapshotRooms, restoreRooms } = require('./roomManager');

const host = { userId: 'u-host', username: 'Host', socketId: 's1' };

test('deleteRoom fires onClosed once with the full participant list', () => {
  const room = createRoom({ name: 'End', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  joinRoom(room.id, 's2', { userId: 'u-guest', username: 'Guest' });
  leaveRoom(room.id, 's2'); // departed members still count as participants
  const events = [];
  room.onClosed = (closedRoom, reason) => events.push({ closedRoom, reason, participants: [...closedRoom.participants] });
  deleteRoom(room.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].closedRoom, room);
  assert.equal(events[0].reason, 'ended');
  assert.deepEqual(events[0].participants, [['u-host', 'Host'], ['u-guest', 'Guest']]);
  assert.equal(getRoom(room.id), null);
  deleteRoom(room.id); // already gone, no double fire
  assert.equal(events.length, 1);
});

test('empty-room TTL fires onClosed with ttl reason', t => {
  const room = createRoom({ name: 'TTL', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  const events = [];
  room.onClosed = (closedRoom, reason) => events.push({ closedRoom, reason });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    leaveRoom(room.id, 's1');
    t.mock.timers.tick(10 * 60 * 1000 + 1);
  } finally {
    t.mock.timers.reset();
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, 'ttl');
  assert.equal(events[0].closedRoom, room);
  assert.equal(getRoom(room.id), null);
});

test('rooms without an onClosed hook delete silently', () => {
  const room = createRoom({ name: 'Silent', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  deleteRoom(room.id);
  assert.equal(getRoom(room.id), null);
});

const song = videoId => ({ videoId, title: videoId, thumbnail: '', duration: 100, addedBy: 'Host' });

test('a snapshot brings the room back with its queue, clock and members list', () => {
  const room = createRoom({ name: 'Crash', password: 'pw', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  joinRoom(room.id, 's2', { userId: 'u-guest', username: 'Guest' });
  addToQueue(room, song('aaaaaaaaaaa'), 'u-host');
  addToQueue(room, song('bbbbbbbbbbb'), 'u-guest');
  updatePlaybackState(room, { isPlaying: true, currentTime: 10 });
  restrictMember(room, 'u-guest');
  room.messages.push({ username: 'Guest', text: 'còn nghe được không', timestamp: Date.now() });
  leaveRoom(room.id, 's2');
  room.lastSyncedAt = Date.now() - 5000; // the song kept playing while the server was gone
  const entry = snapshotRooms().find(candidate => candidate.id === room.id);
  assert.equal(entry.restricted.length, 1);
  assert.equal(entry.messages.length, 1);
  assert.equal(entry.members, undefined);
  deleteRoom(room.id);

  const [restored] = restoreRooms([entry]);
  assert.notEqual(restored, room);
  assert.equal(getRoom(room.id), restored);
  assert.deepEqual(restored.queue.map(item => item.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.equal(restored.password, 'pw');
  assert.equal(restored.isPlaying, true);
  assert.ok(restored.currentTime >= 14.5 && restored.currentTime <= 15.5, `currentTime ${restored.currentTime}`);
  assert.deepEqual([...restored.participants], [['u-host', 'Host'], ['u-guest', 'Guest']]);
  assert.equal(restored.members.size, 0);
  assert.equal(restored.restricted.has('u-guest'), true);
  assert.equal(restored.messages[0].text, 'còn nghe được không');

  // The first member back takes over the empty room.
  const joined = joinRoom(restored.id, 's9', { userId: 'u-guest', username: 'Guest' });
  assert.equal(joined, restored);
  assert.equal(restored.hostId, 'u-guest');
  deleteRoom(restored.id);
  assert.equal(getRoom(room.id), null);
});

test('a song that ended while the server was gone rolls over or stops', () => {
  const room = createRoom({ name: 'Roll', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  addToQueue(room, song('ccccccccccc'), 'u-host');
  addToQueue(room, song('ddddddddddd'), 'u-host');
  updatePlaybackState(room, { isPlaying: true, currentTime: 95 });
  room.lastSyncedAt = Date.now() - 20000;
  const snapshot = snapshotRooms().filter(candidate => candidate.id === room.id);
  deleteRoom(room.id);
  const [restored] = restoreRooms(snapshot);
  assert.equal(restored.currentIndex, 1);
  assert.equal(restored.isPlaying, true);
  assert.ok(restored.currentTime >= 14.5 && restored.currentTime <= 15.5, `currentTime ${restored.currentTime}`);

  deleteRoom(restored.id);
  const [ended] = restoreRooms([{ ...snapshot[0], currentIndex: 1, currentTime: 95, lastSyncedAt: Date.now() - 20000 }]);
  assert.equal(ended.isPlaying, false);
  assert.equal(ended.currentTime, 0);
  deleteRoom(ended.id);
});

test('rooms being ended and duplicate or broken entries never come back', () => {
  const room = createRoom({ name: 'Ending', host });
  room.ending = true;
  assert.deepEqual(snapshotRooms().filter(candidate => candidate.id === room.id), []);
  deleteRoom(room.id);
  assert.deepEqual(restoreRooms([{ id: 'abcd1234' }, null, { id: 'zzzz9999', sessionId: 's', name: 'S' }]).length, 1);
  assert.equal(getRoom('zzzz9999').ownerName, 'Chủ phòng');
  deleteRoom('zzzz9999');
});

test('snapshots carry the session summary data across a restart', t => {
  const room = createRoom({ name: 'Summary', host });
  joinRoom(room.id, 's1', { userId: 'u-host', username: 'Host' });
  room.songListening = new Map([['aaaaaaaaaaa', { song: { videoId: 'aaaaaaaaaaa', title: 'A', author: 'B' }, elapsedMs: 12000 }]]);
  room.artistListening = new Map([['b', { name: 'B', elapsedMs: 12000 }]]);
  room.memberAdditions = new Map([['u-host', { name: 'Host', count: 2 }]]);
  room.recentVideoIds = ['aaaaaaaaaaa'];
  room.sessionArtists = new Set(['b']);
  const snapshot = snapshotRooms().filter(candidate => candidate.id === room.id);
  deleteRoom(room.id);
  const [restored] = restoreRooms(snapshot);
  t.after(() => deleteRoom(restored.id));
  assert.equal(restored.songListening.get('aaaaaaaaaaa').elapsedMs, 12000);
  assert.equal(restored.artistListening.get('b').name, 'B');
  assert.equal(restored.memberAdditions.get('u-host').count, 2);
  assert.deepEqual(restored.recentVideoIds, ['aaaaaaaaaaa']);
  assert.deepEqual([...restored.sessionArtists], ['b']);
  assert.equal(restored.listenedMs, 0);
});
