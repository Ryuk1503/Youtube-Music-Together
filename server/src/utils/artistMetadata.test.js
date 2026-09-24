const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseArtistMetadata, finalizeArtistListening } = require('./artistMetadata');
const { summaryArtists } = require('./summaryArtists');
const fixture = {
  contents: { twoColumnWatchNextResults: { results: { results: { contents: [
    { videoPrimaryInfoRenderer: { title: { runs: [{ text: 'Song - Singer A ft. Singer B, Band C & D (Official MV)' }] } } },
    { videoSecondaryInfoRenderer: { owner: { videoOwnerRenderer: {
      title: { runs: [{ text: 'Studio and 2 others' }] },
      navigationEndpoint: { showDialogCommand: { panelLoadingStrategy: { inlineContent: { dialogViewModel: {
        customContent: { listViewModel: { listItems: ['Studio','Singer A Official','Band C & D'].map(name => ({ listItemViewModel: { title: { content: name } } })) } },
      } } } } },
    } } } },
  ] } }, secondaryResults: { videoOwnerRenderer: { title: { simpleText: 'Unrelated Artist' } } } } },
};
test('reads only the video owner collaborators and combines them with title credits', () => {
  const metadata = parseArtistMetadata(fixture);
  assert.deepEqual(metadata.channelNames, ['Studio','Singer A Official','Band C & D']);
  assert.deepEqual(summaryArtists(metadata).map(a => a.name), ['Singer A','Band C & D','Singer B']);
  assert.throws(() => parseArtistMetadata({}), /unavailable/);
});
test('resolves solo and collaboration time together, even after the queue has been trimmed', async () => {
  const room = {
    queue: [], songListening: new Map([
      ['a',{song:{videoId:'a',title:'Old metadata',author:'Studio and 2 others'},elapsedMs:5000}],
      ['b',{song:{videoId:'b',title:'Solo',author:'Singer A'},elapsedMs:7000}],
    ]),
    artistMetadata: new Map([['a',Promise.resolve(parseArtistMetadata(fixture))],['b',Promise.resolve(null)]]),
  };
  await finalizeArtistListening(room);
  assert.equal(room.artistListening.get('singera').elapsedMs,12000);
  assert.equal(room.artistListening.get('singerb').elapsedMs,5000);
  assert.ok(!room.artistListening.has('studioand2others'));
});
test('matches multiple known channels across x and ampersand collaboration titles', () => {
  assert.deepEqual(summaryArtists({author:'Minh Tốc & Lam',channelNames:['Minh Tốc & Lam'],title:'Chốn Sa Mạc'}).map(a=>a.name),['Minh Tốc & Lam']);
  for (const separator of [' x ', ' & ', ' và ', ', ']) {
    const result=summaryArtists({author:'Studio',channelNames:['Studio','Artist A','Artist B'],title:`Artist A${separator}Artist B - Song`});
    assert.deepEqual(result.map(a=>a.name),['Artist A','Artist B']);
  }
});
