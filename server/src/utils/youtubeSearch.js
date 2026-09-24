const { fetchSearchPage } = require('./youtubeHttp');

const readText = value => typeof value === 'string' ? value
  : value?.simpleText || value?.content || value?.runs?.map(run => run.text || '').join('') || '';

function extractInitialData(html) {
  const assignment = /(?:\b(?:var\s+)?ytInitialData|window\s*\[\s*["']ytInitialData["']\s*\])\s*=\s*/g;
  for (const match of html.matchAll(assignment)) {
    const start = match.index + match[0].length;
    if (html[start] !== '{') continue;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new Error('YouTube initial data unavailable');
}

function parseSearchResults(data) {
  const primary = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
    || data.contents?.singleColumnSearchResultsRenderer;
  if (!primary) throw new Error('YouTube search layout unavailable');
  const videos = [], seen = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object' || videos.length >= 10) return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if (node.adSlotRenderer || node.promotedSparklesWebRenderer || node.promotedVideoRenderer
      || node.inFeedAdLayoutRenderer || node.searchPyvRenderer || node.reelShelfRenderer
      || node.reelItemRenderer || node.shortsLockupViewModel || node.channelRenderer
      || node.playlistRenderer || node.radioRenderer) return;
    const renderer = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
    const lockup = node.lockupViewModel;
    let video;
    if (renderer) {
      const duration = readText(renderer.lengthText) || renderer.thumbnailOverlays?.map(
        overlay => readText(overlay.thumbnailOverlayTimeStatusRenderer?.text)).find(Boolean) || '';
      video = { videoId: renderer.videoId, title: readText(renderer.title),
        author: readText(renderer.ownerText || renderer.shortBylineText || renderer.longBylineText) || 'Unknown',
        thumbnail: renderer.thumbnail?.thumbnails?.at(-1)?.url || '', duration,
        views: readText(renderer.viewCountText || renderer.shortViewCountText) };
    } else if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const meta = lockup.metadata?.lockupMetadataViewModel;
      const thumb = lockup.contentImage?.thumbnailViewModel;
      const parts = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const badges = thumb?.overlays?.flatMap(overlay => overlay.thumbnailBottomOverlayViewModel?.badges || []) || [];
      video = { videoId: lockup.contentId, title: readText(meta?.title),
        author: readText(parts[0]?.metadataParts?.[0]?.text) || 'Unknown',
        thumbnail: thumb?.image?.sources?.at(-1)?.url || '',
        duration: badges.map(badge => badge.thumbnailBadgeViewModel?.text).find(value => /^\d+(?::\d{2}){1,2}$/.test(value)) || '',
        views: readText(parts[1]?.metadataParts?.[0]?.text) };
    }
    if (video && /^[\w-]{11}$/.test(video.videoId) && video.title && !seen.has(video.videoId)) {
      seen.add(video.videoId);
      videos.push(video);
    }
    // A card's menus and preview commands are not additional search results.
    if (renderer || lockup) return;
    for (const child of Object.values(node)) visit(child);
  }
  visit(primary);
  return videos;
}

async function searchYouTube(query, fetchPage = fetchSearchPage) {
  const url = new URL('https://www.youtube.com/results');
  url.search = new URLSearchParams({ search_query: query, hl: 'vi', gl: 'VN' }).toString();
  const response = await fetchPage(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
  return parseSearchResults(extractInitialData(await response.text()));
}

module.exports = { extractInitialData, parseSearchResults, searchYouTube };
