// YouTube cards expose channel names, not a verified recording-artist field.
// Normalize common artist-channel suffixes without guessing from song titles.
function artistKey(song) {
  const name = typeof song?.author === 'string' ? song.author : '';
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/(?:\s*[-–—|]?\s*(?:offic(?:ial|al)(?:\s+(?:channel|music))?|topic|vevo))+\s*$/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/^(unknown|variousartists|youtube)$/, '');
}

function rememberArtist(room, song) {
  const key = artistKey(song);
  if (key) {
    room.sessionArtists ??= new Set();
    room.sessionArtists.add(key);
  }
}

function chooseRecommendation(room, current, candidates, excluded, random = Math.random) {
  const currentArtist = artistKey(current);
  const currentGroup = [];
  const sessionGroup = [];
  const otherGroup = [];
  const seen = new Set(excluded);
  for (const song of candidates) {
    if (seen.has(song.videoId)) continue;
    seen.add(song.videoId);
    const artist = artistKey(song);
    if (artist && artist === currentArtist) currentGroup.push(song);
    else if (artist && room.sessionArtists?.has(artist)) sessionGroup.push(song);
    else otherGroup.push(song);
  }
  // Disjoint groups prevent the current artist from getting two chances.
  const groups = [currentGroup, sessionGroup].filter(group => group.length);
  const group = groups.length ? groups[Math.floor(random() * groups.length)] : otherGroup;
  return group.length ? group[Math.floor(random() * group.length)] : undefined;
}

module.exports = { artistKey, rememberArtist, chooseRecommendation };
