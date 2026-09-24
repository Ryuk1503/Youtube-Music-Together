// Count audio that advances in real time, not seek distance or time spent loading.
export function createListeningProgress(send, { now = () => performance.now(), uuid = () => crypto.randomUUID() } = {}) {
  let videoId, playbackId, total = 0, last, lastSent = -Infinity, ended = false;
  const emit = audio => {
    if (!videoId) return;
    send({ videoId, playbackId, listenedMs: Math.floor(total), duration: audio.duration });
    lastSent = now();
  };
  const sample = (audio, force = false) => {
    const time = now();
    if (last && !audio.seeking) {
      const mediaMs = (audio.currentTime - last.position) * 1000;
      const wallMs = time - last.time;
      if (last.running && mediaMs > 0 && mediaMs <= 30000 && mediaMs <= wallMs + 1000) total += Math.min(mediaMs, wallMs);
    }
    last = { position: audio.currentTime, time, running: !audio.paused && !audio.seeking };
    if (force || time - lastSent >= 10000) emit(audio);
  };
  return {
    begin(id) {
      if (id !== videoId || ended) { videoId = id; playbackId = uuid(); total = 0; lastSent = -Infinity; ended = false; }
      last = null;
    },
    sample,
    reset() { last = null; },
    finish(audio) { sample(audio, true); ended = true; last = null; },
  };
}
