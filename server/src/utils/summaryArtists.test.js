const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summaryArtists } = require('./summaryArtists');
const { getListeningTime } = require('./listeningTime');
test('removes Official and Offical suffixes before comparing titles, without removing a name prefix', () => {
  for (const suffix of ['Official','Offical','OFFICIAL','Offical Channel']) {
    const result=summaryArtists({author:`DEV và Lý Bực ${suffix}`,title:'Lý Bực - Cát Bụi'});
    assert.deepEqual(result,[{key:'lybuc',name:'Lý Bực'}]);
  }
  assert.equal(summaryArtists({author:'Official HIGE DANdism',title:'Official HIGE DANdism - Song'})[0].name,'Official HIGE DANdism');
});
test('expands featured credits for collapsed co-uploaders without splitting band names', () => {
  const artists = summaryArtists({author:'Da LAB Official và 2 người khác',title:'Bức Tường Ngăn Cách Hai Ta - Emcee L ft. Only C, Minh Tốc & Lam (Official MV)'});
  assert.deepEqual(artists.map(a=>a.name),['Emcee L','Only C','Minh Tốc & Lam']);
  assert.deepEqual(summaryArtists({author:'Da LAB Official và 2 người khác',title:'Bài hát'}),[]);
});
test('matches collaborators against title and aggregates with the solo channel', () => {
  const room = { queue: [{author:'DEV và Lý Bực Official',title:'Lý Bực - Cát Bụi (Official Music Video)'}], currentIndex:0,isPlaying:true,members:new Map([['a',{}]]),listeningUpdatedAt:0 };
  getListeningTime(room,5000);
  room.queue[0]={author:'Lý Bực',title:'8 Dặm'};
  getListeningTime(room,8000);
  assert.deepEqual([...room.artistListening.values()],[{name:'Lý Bực',elapsedMs:8000}]);
});
test('preserves bands, handles accents and word boundaries, retains uncertain channels', () => {
  assert.equal(summaryArtists({author:'Minh Tốc & Lam',title:'Minh Tốc & Lam - Chốn Sa Mạc'})[0].name,'Minh Tốc & Lam');
  assert.equal(summaryArtists({author:'DEV và Lý Bực Official',title:'LY BUC - Cat Bui'})[0].name,'Lý Bực');
  assert.equal(summaryArtists({author:'An và Lý Bực',title:'Lang thang - Lý Bực'})[0].name,'Lý Bực');
  assert.deepEqual(summaryArtists({author:'DEV và Lý Bực',title:'Cát Bụi'}),[]);
  assert.deepEqual(summaryArtists({author:'Unknown',title:'Song'}),[]);
});
