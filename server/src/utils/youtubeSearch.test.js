const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractInitialData, parseSearchResults, searchYouTube } = require('./youtubeSearch');
const card = (id, extra = {}) => ({ videoRenderer: { videoId: id, title: { runs: [{ text: 'Chốn Sa Mạc' }] }, ...extra } });
const page = contents => ({ contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents } }, secondaryContents: card('sidebar0001') } } });

test('extracts balanced JSON including escaped strings and window assignments', () => {
  const data = { title: 'a } "quoted" \\ string', nested: { value: 1 } };
  for (const prefix of ['var ytInitialData = ', 'window["ytInitialData"] = ']) {
    assert.deepEqual(extractInitialData(`<script>${prefix}${JSON.stringify(data)};</script>`), data);
  }
  assert.throws(() => extractInitialData('<html>Consent</html>'), /unavailable/);
});

test('retains artist cards without canonicalBaseUrl and tolerates absent metadata', () => {
  const results = parseSearchResults(page([card('abcdefghijk', { ownerText: { runs: [{ text: 'Minh Tốc & Lam' }] } })]));
  assert.equal(results[0].author, 'Minh Tốc & Lam');
  assert.equal(results[0].duration, '');
  assert.equal(results[0].title, 'Chốn Sa Mạc');
});

test('preserves mixed card order, deduplicates, excludes ads and non-video cards, limits to ten', () => {
  const modern = { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'modern00001', metadata: { lockupMetadataViewModel: { title: { content: 'Modern' } } } } };
  const contents = [card('first000001'), { adSlotRenderer: card('advert00001') }, { reelShelfRenderer: card('shorts00001') }, modern,
    { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: 'playlist001' } }, card('first000001'),
    { gridShelfViewModel: { contents: Array.from({ length: 15 }, (_, i) => card(`video${String(i).padStart(6, '0')}`)) } }];
  const results = parseSearchResults(page(contents));
  assert.deepEqual(results.map(v => v.videoId), ['first000001', 'modern00001', ...Array.from({ length: 8 }, (_, i) => `video${String(i).padStart(6, '0')}`)]);
});

test('distinguishes empty results from an unsupported page', () => {
  assert.deepEqual(parseSearchResults(page([])), []);
  assert.throws(() => parseSearchResults({}), /layout unavailable/);
});

test('encodes query and requests Vietnamese results; reports upstream errors', async () => {
  const query = 'chốn sa mạc & live';
  const result = await searchYouTube(query, async (url, options) => {
    assert.equal(url.searchParams.get('search_query'), query);
    assert.equal(url.searchParams.get('hl'), 'vi');
    assert.equal(url.searchParams.get('gl'), 'VN');
    assert.ok(options.signal);
    return { ok: true, text: async () => `var ytInitialData = ${JSON.stringify(page([card('abcdefghijk')]))};` };
  });
  assert.equal(result.length, 1);
  await assert.rejects(searchYouTube(query, async () => ({ ok: false, status: 429 })), /429/);
});
