const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAlbumTracks } = require('./albumTracks');
test('album boundaries are contiguous, final track ends at measured duration', () => {
  assert.deepEqual(buildAlbumTracks([{ title: ' First ', start: 0 }, { title: 'Last', start: 201 }], 390.141), [
    { title: 'First', start: 0, end: 201 }, { title: 'Last', start: 201, end: 390.141 },
  ]);
});
test('rejects duplicate or out-of-range boundaries and empty titles', () => {
  for (const tracks of [
    [{ title: 'A', start: 0 }, { title: 'B', start: 0 }],
    [{ title: 'A', start: 1 }, { title: 'B', start: 20 }],
    [{ title: 'A', start: 0 }, { title: 'B', start: 200 }],
    [{ title: 'A', start: 0 }, { title: ' ', start: 20 }],
  ]) assert.throws(() => buildAlbumTracks(tracks, 100));
});
