const { nextSong, addToQueue, updatePlaybackState } = require('./roomManager');
const { getRecommendations } = require('./recommendations');
const { rememberArtist, chooseRecommendation } = require('./artistPreference');

function durationSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value !== 'string' || !/^\d+(?::[0-5]\d){1,2}$/.test(value)) return 0;
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

// Called by the server clock, so screen-off browser timer throttling is irrelevant.
async function prepareQueueEnd(room, { recommend = getRecommendations, notify = () => {}, isCurrent = () => true, now = Date.now() } = {}) {
  const current = room.queue[room.currentIndex];
  if (!current || !room.autoplay || !room.isPlaying || room.ending || !room.members.size ||
      room.currentIndex + 1 < room.queue.length || room.autoplayRequest || room.earlyAutoplayRequest ||
      room.earlyAutoplayAttempt === current) return;
  const duration = room.audioClock?.song === current ? room.audioClock.duration : durationSeconds(current.duration);
  const position = room.currentTime + Math.max(0, now - room.lastSyncedAt) / 1000;
  if (!duration || duration - position > 10) return;
  room.earlyAutoplayAttempt = current;
  const request = { song: current, promise: Promise.resolve().then(() => recommend(current.videoId)) };
  room.earlyAutoplayRequest = request;
  try {
    const candidates = await request.promise;
    if (room.earlyAutoplayRequest !== request || !isCurrent() || room.ending || !room.autoplay ||
        !room.isPlaying || !room.members.size || room.queue[room.currentIndex] !== current ||
        room.currentIndex + 1 < room.queue.length) return;
    const excluded = new Set([...room.queue.map(song => song.videoId), ...(room.recentVideoIds || [])]);
    const song = chooseRecommendation(room, current, candidates, excluded);
    if (song && addToQueue(room, { ...song, addedBy: 'YouTube đề xuất', recommended: true })) notify();
  } catch { /* Normal end-of-track autoplay remains the fallback. */ }
  finally {
    if (room.earlyAutoplayRequest === request) room.earlyAutoplayRequest = null;
  }
}

// One outstanding selection per room; queue additions always take priority.
async function advanceRoom(room, { notify, recommend = getRecommendations, isCurrent = () => true, failed = false }) {
  if (room.autoplayRequest) {
    // A manually queued track must remain skippable while recommendations load.
    if (room.currentIndex + 1 >= room.queue.length) return;
    cancelAutoplay(room);
  }
  const current = room.queue[room.currentIndex];
  if (!current) return;
  const prepared = room.earlyAutoplayRequest;
  room.earlyAutoplayRequest = null;
  if (!failed) rememberArtist(room, current);
  room.recentVideoIds = [...(room.recentVideoIds || []), current.videoId].slice(-50);
  room.autoplayError = '';
  if (room.currentIndex + 1 < room.queue.length) {
    nextSong(room);
    notify();
    return;
  }
  updatePlaybackState(room, { isPlaying: false });
  if (!room.autoplay) { notify(); return; }
  room.autoplayFailures = failed ? (room.autoplayFailures || 0) + 1 : 0;
  if (room.autoplayFailures >= 3) {
    room.autoplayError = 'Không phát được các bài đề xuất. Hãy thêm một bài khác.';
    notify();
    return;
  }
  const request = {};
  room.autoplayRequest = request;
  room.autoplayLoading = true;
  notify();
  let candidates = [];
  try { candidates = await (prepared?.song === current ? prepared.promise : recommend(current.videoId)); }
  catch { /* A visible error is returned below if no manual song arrived. */ }
  if (room.autoplayRequest !== request) return;
  room.autoplayRequest = null;
  room.autoplayLoading = false;
  if (!isCurrent() || !room.autoplay || room.members.size === 0 || room.queue[room.currentIndex] !== current) {
    if (isCurrent()) notify();
    return;
  }
  if (room.currentIndex + 1 >= room.queue.length) {
    const excluded = new Set([...room.queue.map(song => song.videoId), ...room.recentVideoIds]);
    const song = chooseRecommendation(room, current, candidates, excluded);
    if (!song || !addToQueue(room, { ...song, addedBy: 'YouTube đề xuất', recommended: true })) {
      room.autoplayError = 'Chưa lấy được bài đề xuất từ YouTube. Bạn có thể thêm bài hoặc bấm Tiếp theo để thử lại.';
      notify();
      return;
    }
  }
  nextSong(room);
  notify();
}

function cancelAutoplay(room) {
  room.earlyAutoplayRequest = null;
  room.earlyAutoplayAttempt = null;
  room.autoplayRequest = null;
  room.autoplayLoading = false;
}

module.exports = { advanceRoom, cancelAutoplay, prepareQueueEnd, durationSeconds };
