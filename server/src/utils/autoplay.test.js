const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, addToQueue, deleteRoom } = require('./roomManager');
const { advanceRoom, cancelAutoplay } = require('./autoplay');
const { parseRecommendations } = require('./recommendations');

function roomFor(t) {
  const room = createRoom({ name: 'test', host: {socketId:'host', userId:'user'} });
  room.members.set('host', {});
  addToQueue(room, { videoId:'aaaaaaaaaaa', title:'First' });
  t.after(()=>deleteRoom(room.id));
  return room;
}
const notify = () => {};
test('uses YouTube order, skips repeats, and advances one shared room state', async t => {
 const room=roomFor(t);
 await advanceRoom(room,{notify,recommend:async()=>[{videoId:'aaaaaaaaaaa'},{videoId:'bbbbbbbbbbb',title:'Next'}]});
 assert.equal(room.queue[room.currentIndex].videoId,'bbbbbbbbbbb');
 assert.equal(room.queue[room.currentIndex].recommended,true);
 assert.equal(room.isPlaying,true);
});
test('manual queue takes priority, including additions while YouTube is pending', async t => {
 const room=roomFor(t);let resolve;let requests=0;
 const pending=advanceRoom(room,{notify,recommend:()=>{requests++;return new Promise(r=>resolve=r);}});
 await advanceRoom(room,{notify,recommend:()=>assert.fail('duplicate request')});
 addToQueue(room,{videoId:'ccccccccccc'});
 resolve([{videoId:'bbbbbbbbbbb'}]);await pending;
 assert.equal(requests,1);assert.equal(room.queue.length,2);
 assert.equal(room.queue[room.currentIndex].videoId,'ccccccccccc');
 addToQueue(room,{videoId:'ddddddddddd'});
 await advanceRoom(room,{notify,recommend:()=>assert.fail('should use queue')});
 assert.equal(room.queue[room.currentIndex].videoId,'ddddddddddd');
});
test('disable, pause, or everyone leaving prevents a late response starting music', async t => {
 for(const action of [r=>{r.autoplay=false;cancelAutoplay(r);},cancelAutoplay,r=>r.members.clear()]) {
  const room=roomFor(t);let resolve;
  const pending=advanceRoom(room,{notify,recommend:()=>new Promise(r=>resolve=r)});
  action(room);resolve([{videoId:'bbbbbbbbbbb'}]);await pending;
  assert.equal(room.currentIndex,0);assert.equal(room.isPlaying,false);assert.equal(room.autoplayLoading,false);
 }
});

test('next immediately uses a newly queued song while recommendation lookup is pending', async t => {
 const room=roomFor(t); let resolve;
 const pending=advanceRoom(room,{notify,recommend:()=>new Promise(r=>resolve=r)});
 addToQueue(room,{videoId:'ccccccccccc'});
 await advanceRoom(room,{notify,recommend:()=>assert.fail('manual song is ready')});
 assert.equal(room.queue[room.currentIndex].videoId,'ccccccccccc');
 assert.equal(room.autoplayLoading,false);
 resolve([{videoId:'bbbbbbbbbbb'}]); await pending;
 assert.equal(room.queue[room.currentIndex].videoId,'ccccccccccc');
 assert.equal(room.queue.length,2);
});
test('reports provider failure without substituting search results or looping',async t=>{
 const room=roomFor(t);
 await advanceRoom(room,{notify,recommend:async()=>{throw Error('blocked');}});
 assert.equal(room.isPlaying,false);assert.equal(room.autoplayLoading,false);assert.ok(room.autoplayError);
 room.autoplay=false;
 await advanceRoom(room,{notify,recommend:()=>assert.fail('disabled')});
});
test('stops after three consecutive failed recommended videos',async t=>{
 const room=roomFor(t);room.autoplayFailures=2;
 await advanceRoom(room,{notify,failed:true,recommend:()=>assert.fail('retry limit')});
 assert.ok(room.autoplayError);assert.equal(room.isPlaying,false);
});
test('long sessions trim old queue entries instead of hitting 200-song limit',async t=>{
 const room=roomFor(t);
 room.queue=Array.from({length:200},(_,i)=>({videoId:String(i).padStart(11,'0')}));room.currentIndex=199;
 await advanceRoom(room,{notify,recommend:async()=>[{videoId:'bbbbbbbbbbb'}]});
 assert.equal(room.queue.length,2);assert.equal(room.queue[room.currentIndex].videoId,'bbbbbbbbbbb');
});
test('parses modern and legacy related cards, excluding ads, playlists, duplicates and live videos',()=>{
 const card={lockupViewModel:{contentType:'LOCKUP_CONTENT_TYPE_VIDEO',contentId:'aaaaaaaaaaa',metadata:{lockupMetadataViewModel:{title:{content:'Song'}}},contentImage:{thumbnailViewModel:{overlays:[{thumbnailBottomOverlayViewModel:{badges:[{thumbnailBadgeViewModel:{text:'3:20'}}]}}]}}}};
 const data={contents:{twoColumnWatchNextResults:{secondaryResults:{results:[card,card,{lockupViewModel:{...card.lockupViewModel,contentType:'LOCKUP_CONTENT_TYPE_PLAYLIST'}},{compactVideoRenderer:{videoId:'bbbbbbbbbbb',title:{simpleText:'Legacy'},lengthText:{simpleText:'4:00'}}},{compactVideoRenderer:{videoId:'ccccccccccc',title:{simpleText:'Live'}}}]}}}};
 assert.deepEqual(parseRecommendations(data).map(v=>v.videoId),['aaaaaaaaaaa','bbbbbbbbbbb']);
});
