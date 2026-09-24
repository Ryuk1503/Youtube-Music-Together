const test=require('node:test');
const assert=require('node:assert/strict');
const {createRoom,addToQueue,deleteRoom}=require('./roomManager');
const {addAutomaticSong}=require('./automaticQueue');
const user={userId:'user',username:'Tester'};
function makeRoom(t){
 const room=createRoom({name:'Test',host:{socketId:'host',userId:'user'}});
 room.members.set('host',user);addToQueue(room,{videoId:'aaaaaaaaaaa',author:'Artist'});
 room.isPlaying=true;room.currentTime=42;t.after(()=>deleteRoom(room.id));return room;
}
const recommend=async()=>[{videoId:'bbbbbbbbbbb',author:'Artist'}];
test('adds exactly one recommendation without changing playback, even with autoplay off',async t=>{
 const room=makeRoom(t);room.autoplay=false;
 const result=await addAutomaticSong(room,'host',user,{recommend});
 assert.equal(result.success,true);assert.equal(room.queue.length,2);
 assert.equal(room.currentIndex,0);assert.equal(room.isPlaying,true);assert.equal(room.currentTime,42);
 const duplicate=await addAutomaticSong(room,'host',user,{recommend});assert.equal(duplicate.success,false);
});
test('rejects concurrent clicks and excludes songs added while waiting',async t=>{
 const room=makeRoom(t);let resolve;
 const first=addAutomaticSong(room,'host',user,{recommend:()=>new Promise(r=>resolve=r)});
 assert.equal((await addAutomaticSong(room,'host',user,{recommend})).success,false);
 addToQueue(room,{videoId:'bbbbbbbbbbb'});
 resolve(await recommend());assert.equal((await first).success,false);assert.equal(room.queue.length,2);assert.equal(room.autoAdding,false);
});
test('rechecks membership, restriction and current song after the request',async t=>{
 for(const change of [r=>r.members.clear(),r=>r.restricted.add('user'),r=>{r.queue[0]={videoId:'different'};}]){
  const room=makeRoom(t);let resolve;
  const pending=addAutomaticSong(room,'host',user,{recommend:()=>new Promise(r=>resolve=r)});
  change(room);resolve(await recommend());assert.equal((await pending).success,false);assert.equal(room.queue.length,1);
 }
});
test('missing seed, restricted user and provider failure return useful errors',async t=>{
 const room=makeRoom(t);room.currentIndex=-1;
 assert.equal((await addAutomaticSong(room,'host',user,{recommend})).success,false);
 room.currentIndex=0;room.restricted.add('user');
 assert.equal((await addAutomaticSong(room,'host',user,{recommend})).success,false);
 room.restricted.clear();
 const result=await addAutomaticSong(room,'host',user,{recommend:async()=>{throw Error('offline');}});
 assert.equal(result.success,false);assert.ok(result.error);assert.equal(room.autoAdding,false);
});
