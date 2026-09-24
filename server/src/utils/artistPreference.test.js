const test = require('node:test');
const assert = require('node:assert/strict');
const { artistKey, rememberArtist, chooseRecommendation: select } = require('./artistPreference');
const chooseRecommendation = (...args) => select(...args, () => 0);
const { advanceRoom } = require('./autoplay');
const { createRoom, addToQueue, deleteRoom } = require('./roomManager');

const song = (videoId, author) => ({ videoId, author });
test('normalizes artist channel variants, case, accents and separators', () => {
  for (const author of ['Cá Hồi Hoang', 'CA HOI HOANG - Topic', 'Cá Hồi Hoang Official', 'Cá Hồi Hoang Official Channel']) {
    assert.equal(artistKey({author}), 'cahoihoang');
  }
  assert.equal(artistKey({author:'TaylorSwiftVEVO'}), artistKey({author:'Taylor Swift'}));
  assert.equal(artistKey({author:'Unknown'}), '');
  assert.equal(artistKey({title:'Artist - Song'}), '');
});
test('the current-artist group can be selected', () => {
  const room = {};
  rememberArtist(room, song('past', 'The Cassette'));
  const candidates = [song('other','Other'),song('past-new','The Cassette'),song('current-new','Cá Hồi Hoang - Topic')];
  assert.equal(chooseRecommendation(room, song('current','Cá Hồi Hoang'), candidates, new Set()).videoId,'current-new');
});
test('uses the available session group when no current-artist candidate exists', () => {
  const room = {};
  rememberArtist(room,song('past','The Cassette'));
  rememberArtist(room,song('past2','Ngọt'));
  const candidates = [song('other','Other'),song('past-new','Ngọt'),song('past-new2','The Cassette')];
  assert.equal(chooseRecommendation(room,song('current','Cá Hồi Hoang'),candidates,new Set()).videoId,'past-new');
});

test('selects groups with equal probability regardless of size, and randomizes the song inside', () => {
  const room = {sessionArtists:new Set(['current','past'])};
  const current = song('now','Current');
  const candidates = [song('a','Current'),song('b','Current'),song('c','Current'),song('d','Past')];
  let samples = [0.49,0.99];
  assert.equal(select(room,current,candidates,new Set(),()=>samples.shift()).videoId,'c');
  samples = [0.5,0];
  assert.equal(select(room,current,candidates,new Set(),()=>samples.shift()).videoId,'d');
});

test('deduplicates recommendation cards before random selection', () => {
  const candidates=[song('a','Current'),song('a','Current'),song('b','Current')];
  let samples=[0,0.5];
  assert.equal(select({},song('now','Current'),candidates,new Set(),()=>samples.shift()).videoId,'b');
});
test('excludes played videos even when their artist matches and falls back to YouTube order', () => {
  const candidates=[song('old','Ngọt'),song('other1','Other'),song('other2','Another')];
  assert.equal(chooseRecommendation({},song('current','Ngọt'),candidates,new Set(['old'])).videoId,'other1');
  assert.equal(chooseRecommendation({},song('current','Ngọt'),candidates,new Set(candidates.map(s=>s.videoId))),undefined);
});
test('unknown authors do not become matching artists and room histories stay separate', () => {
  const room = {};
  rememberArtist(room,song('unknown','Unknown'));
  rememberArtist(room,song('past','The Cassette'));
  const candidates=[song('other','Other'),song('past-new','The Cassette')];
  assert.equal(chooseRecommendation({},song('current','Unknown'),candidates,new Set()).videoId,'other');
  assert.deepEqual([...room.sessionArtists],['thecassette']);
});
test('history survives queue trimming and unplayed queued artists are not favored', async t => {
  const room=createRoom({name:'Artist test',host:{socketId:'host',userId:'host'}});
  t.after(()=>deleteRoom(room.id));room.members.set('host',{});
  addToQueue(room,song('aaaaaaaaaaa','Ngọt'));
  addToQueue(room,song('bbbbbbbbbbb','The Cassette'));
  await advanceRoom(room,{notify:()=>{},recommend:()=>assert.fail('manual queue comes first')});
  assert.ok(room.sessionArtists.has('ngot'));
  assert.equal(room.sessionArtists.has('thecassette'),false);
  room.queue=[room.queue[1]];room.currentIndex=0;
  await advanceRoom(room,{notify:()=>{},recommend:async()=>[song('ccccccccccc','Other'),song('ddddddddddd','Ngọt - Topic')]});
  assert.equal(room.queue[room.currentIndex].videoId,'ddddddddddd');
});
test('unplayable videos do not pollute session artist history',async t=>{
  const room=createRoom({name:'Artist test',host:{socketId:'host',userId:'host'}});
  t.after(()=>deleteRoom(room.id));room.members.set('host',{});
  addToQueue(room,song('aaaaaaaaaaa','Failed Artist'));room.autoplay=false;
  await advanceRoom(room,{notify:()=>{},failed:true});
  assert.equal(room.sessionArtists.size,0);
});
