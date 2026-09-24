const { fetchSearchPage } = require('./youtubeHttp');
const { extractInitialData } = require('./youtubeSearch');
const { summaryArtists } = require('./summaryArtists');
const cache = new Map();
const text = value => value?.simpleText || value?.content || value?.runs?.map(r => r.text || '').join('') || '';
function parseArtistMetadata(data) {
  const contents = data.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
  const title = text(contents.find(n => n.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer.title);
  const owner = contents.find(n => n.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer.owner?.videoOwnerRenderer;
  if (!title || !owner) throw Error('Artist metadata unavailable');
  const dialog = owner.navigationEndpoint?.showDialogCommand?.panelLoadingStrategy?.inlineContent?.dialogViewModel;
  const channelNames = (dialog?.customContent?.listViewModel?.listItems || []).map(item => text(item.listItemViewModel?.title)).filter(Boolean);
  const author = text(owner.title);
  if (!channelNames.length && author) channelNames.push(author);
  return { title, author, channelNames };
}
async function getArtistMetadata(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw Error('Invalid video ID');
  const old = cache.get(videoId);
  if (old && old.expires > Date.now()) return old.promise;
  const promise = (async () => {
    const response = await fetchSearchPage(`https://www.youtube.com/watch?v=${videoId}&hl=vi&gl=VN`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw Error(`YouTube HTTP ${response.status}`);
    return parseArtistMetadata(extractInitialData(await response.text()));
  })();
  cache.set(videoId, { promise, expires: Date.now() + 30 * 60 * 1000 });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  try { return await promise; } catch (error) { cache.delete(videoId); throw error; }
}
const prepareArtistMetadata = song => getArtistMetadata(song.videoId).catch(() => null);
async function finalizeArtistListening(room) {
  if (!room.songListening) return;
  const artists = new Map();
  for (const track of room.songListening.values()) {
    const metadata = await (room.artistMetadata?.get(track.song.videoId) || Promise.resolve(null));
    for (const { key, name } of summaryArtists(metadata ? { ...track.song, ...metadata } : track.song)) {
      const artist = artists.get(key) || { name, elapsedMs: 0 };
      artist.elapsedMs += track.elapsedMs;
      artists.set(key, artist);
    }
  }
  room.artistListening = artists;
}
module.exports = { parseArtistMetadata, prepareArtistMetadata, finalizeArtistListening };
