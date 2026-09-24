const cache = new Map();
const text = value => value?.simpleText || value?.runs?.map(run => run.text).join('') || '';

function parseRecommendations(data) {
  const feed = data.contents?.twoColumnWatchNextResults?.secondaryResults;
  const videos = [];
  const seen = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.adSlotRenderer || node.promotedSparklesWebRenderer || node.inFeedAdLayoutRenderer) return;
    const compact = node.compactVideoRenderer;
    const lockup = node.lockupViewModel;
    let video;
    if (compact && !compact.badges?.some(b => /LIVE/.test(b.metadataBadgeRenderer?.style))) {
      video = { videoId: compact.videoId, title: text(compact.title),
        author: text(compact.shortBylineText || compact.longBylineText),
        thumbnail: compact.thumbnail?.thumbnails?.at(-1)?.url || '', duration: text(compact.lengthText) };
    } else if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const meta = lockup.metadata?.lockupMetadataViewModel;
      const thumb = lockup.contentImage?.thumbnailViewModel;
      const badges = thumb?.overlays?.flatMap(o => o.thumbnailBottomOverlayViewModel?.badges || []) || [];
      const duration = badges.map(b => b.thumbnailBadgeViewModel?.text).find(t => /^\d+(?::\d{2}){1,2}$/.test(t));
      video = { videoId: lockup.contentId, title: meta?.title?.content,
        author: meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '',
        thumbnail: thumb?.image?.sources?.at(-1)?.url || '', duration };
    }
    if (video && /^[\w-]{11}$/.test(video.videoId) && video.title && video.duration && !seen.has(video.videoId)) {
      seen.add(video.videoId);
      videos.push(video);
    }
    if (compact || lockup) return;
    for (const value of Object.values(node)) visit(value);
  }
  visit(feed);
  return videos;
}

async function getRecommendations(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) return [];
  const existing = cache.get(videoId);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=vi&gl=VN`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
    const html = await response.text();
    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!match) throw new Error('YouTube recommendations unavailable');
    return parseRecommendations(JSON.parse(match[1])).filter(video => video.videoId !== videoId);
  })();
  cache.set(videoId, { promise, expires: Date.now() + 5 * 60 * 1000 });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  try { return await promise; } catch (error) { cache.delete(videoId); throw error; }
}

module.exports = { getRecommendations, parseRecommendations };
