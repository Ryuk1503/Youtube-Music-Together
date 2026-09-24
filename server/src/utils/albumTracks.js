function buildAlbumTracks(tracklist, duration) {
  if (!Array.isArray(tracklist) || tracklist.length < 2 || tracklist.length > 200 ||
      !Number.isFinite(duration) || duration <= 0 || duration >= 604800) throw new Error('Invalid album');
  return tracklist.map((track, index) => {
    const end = index + 1 < tracklist.length ? tracklist[index + 1].start : duration;
    if (typeof track.title !== 'string' || !track.title.trim() || track.title.length > 500 ||
        !Number.isFinite(track.start) || track.start < 0 || (index === 0 && track.start !== 0) ||
        !Number.isFinite(end) || end <= track.start || end > duration) throw new Error('Invalid album track');
    return { title: track.title.trim(), start: track.start, end };
  });
}
module.exports = { buildAlbumTracks };
