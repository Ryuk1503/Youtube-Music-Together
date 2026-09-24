const { summaryArtists } = require('./summaryArtists');
let intervalObserver = null;
function observeListeningIntervals(observer) { intervalObserver = observer; }
function getListeningTime(room, now = Date.now()) {
  const running = !!(room.isPlaying && room.queue[room.currentIndex] && room.members.size);
  const elapsed = running && room.listeningUpdatedAt != null
    ? Math.max(0, now - room.listeningUpdatedAt) : 0;
  room.listenedMs = (room.listenedMs || 0) + elapsed;
  if (elapsed > 0) intervalObserver?.(room, now - elapsed, now);
  const song = room.queue[room.currentIndex];
  if (elapsed > 0 && song?.videoId) {
    room.songListening ||= new Map();
    const track = room.songListening.get(song.videoId) || { song: { videoId: song.videoId, title: song.title, author: song.author }, elapsedMs: 0 };
    track.elapsedMs += elapsed;
    room.songListening.set(song.videoId, track);
  }
  if (elapsed > 0) for (const { key, name } of summaryArtists(song)) {
    room.artistListening ||= new Map();
    const artist = room.artistListening.get(key) || { name, elapsedMs: 0 };
    artist.elapsedMs += elapsed;
    room.artistListening.set(key, artist);
  }
  room.listeningUpdatedAt = now;
  return { elapsedMs: room.listenedMs, running };
}
module.exports = { getListeningTime, observeListeningIntervals };
