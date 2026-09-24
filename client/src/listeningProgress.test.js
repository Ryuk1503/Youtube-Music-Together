import test from 'node:test';
import assert from 'node:assert/strict';
import { createListeningProgress } from './listeningProgress.js';
test('counts heard time, ignores seeks and pauses, retries keep one playback, replay gets a new one', () => {
  let clock = 0, id = 0; const sent = [];
  const tracker = createListeningProgress(value => sent.push(value), { now: () => clock, uuid: () => String(++id) });
  const audio = { currentTime: 0, duration: 180, paused: false, seeking: false };
  tracker.begin('song'); tracker.sample(audio, true);
  for (let i = 1; i <= 3; i++) { clock += 10000; audio.currentTime += 10; tracker.sample(audio); }
  assert.equal(sent.at(-1).listenedMs, 30000);
  tracker.reset(); audio.currentTime = 150; clock += 1000; tracker.sample(audio);
  audio.paused = true; tracker.sample(audio, true); clock += 60000; tracker.sample(audio, true);
  assert.equal(sent.at(-1).listenedMs, 30000);
  tracker.begin('song'); tracker.sample(audio, true);
  assert.equal(sent.at(-1).playbackId, '1'); assert.equal(sent.at(-1).listenedMs, 30000);
  tracker.finish(audio); tracker.begin('song'); tracker.sample(audio, true);
  assert.equal(sent.at(-1).playbackId, '2'); assert.equal(sent.at(-1).listenedMs, 0);
});
test('large unexplained position jumps do not count as listening', () => {
  let clock = 0; const sent = [];
  const tracker = createListeningProgress(value => sent.push(value), { now: () => clock, uuid: () => 'id' });
  const audio = { currentTime: 0, duration: 300, paused: false };
  tracker.begin('song'); tracker.sample(audio, true);
  clock += 1000; audio.currentTime = 120; tracker.sample(audio, true);
  assert.equal(sent.at(-1).listenedMs, 0);
});
