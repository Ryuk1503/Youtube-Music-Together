const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: connect } = require('../../../client/node_modules/socket.io-client');
const jwt = require('jsonwebtoken');
const { setupSocket: productionSetup } = require('./handler');
function setupSocket(io, options) {
  productionSetup(io, {...options, originAllowed:()=>true, authenticateSession:async socket=>{
    const decoded=jwt.verify(socket.handshake.auth.token,process.env.JWT_SECRET);
    return {id:decoded.userId,username:decoded.username,token_hash:'test-session'};
  }});
}

const { deleteRoom } = require('../utils/roomManager');

test('server timer queues and prefetches a recommendation at the host ten-second mark', { timeout: 8000 }, async t => {
 process.env.JWT_SECRET = 'test-only';
 const server = http.createServer(); const io = new Server(server);
 const prefetched = []; let requests = 0;
 setupSocket(io, { artistMetadata: async () => null, prefetch: id => { if (id) prefetched.push(id); },
   recommend: async () => { requests++; return [{ videoId: 'bbbbbbbbbbb', duration: '3:00' }]; } });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const host = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'],
   auth: { token: jwt.sign({ userId: 'host', username: 'Host' }, process.env.JWT_SECRET) } });
 let roomId;
 t.after(async () => { host.disconnect(); await new Promise(resolve => io.close(resolve)); if (roomId) deleteRoom(roomId); });
 await new Promise(resolve => host.once('connect', resolve));
 const created = await host.timeout(2000).emitWithAck('room:create', { name: 'Early' }); roomId = created.room.id;
 await host.timeout(2000).emitWithAck('queue:add', { videoId: 'aaaaaaaaaaa', duration: '3:00' });
 const queued = new Promise(resolve => host.once('queue:updated', resolve));
 host.emit('player:clock', { videoId: 'aaaaaaaaaaa', currentTime: 170, duration: 180 });
 const state = await queued;
 assert.equal(state.currentIndex, 0); assert.equal(state.queue.length, 2);
 assert.equal(state.queue[1].videoId, 'bbbbbbbbbbb');
 assert.deepEqual(prefetched, ['bbbbbbbbbbb']); assert.equal(requests, 1);
 const changed = new Promise(resolve => host.once('player:songChanged', resolve));
 host.emit('player:ended', { videoId: 'aaaaaaaaaaa' });
 assert.equal((await changed).playbackState.currentIndex, 1);
 assert.equal(requests, 1);
});

test('two clients receive the same recommended song after queue exhaustion', {timeout:15000}, async t => {
 process.env.JWT_SECRET='test-only';
 const server=http.createServer();const io=new Server(server);
 let requests=0;
 const prefetched=[];
 setupSocket(io,{prefetch:id=>{if(id)prefetched.push(id);},artistMetadata:async()=>null,persistSession:async()=>{},recommend:async id=>{requests++;return [{videoId:id==='aaaaaaaaaaa'?'bbbbbbbbbbb':'ccccccccccc',title:'YouTube next',duration:'3:00'}];}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const clients=[];let roomId;
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));if(roomId)deleteRoom(roomId);});
 for (let i=0;i<2;i++) {
  const socket=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],auth:{token:jwt.sign({userId:'user'+i,username:'Tester'+i},process.env.JWT_SECRET)}});
  clients.push(socket);await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});
 }
 const [host,guest]=clients;
 const ack=(s,event,...args)=>s.timeout(3000).emitWithAck(event,...args);
 const created=await ack(host,'room:create',{name:'Auto test'});roomId=created.room.id;
 await ack(guest,'room:join',{roomId});
 await ack(host,'queue:add',{videoId:'aaaaaaaaaaa',title:'Manual',duration:'2:00'});
 const waitSong=s=>new Promise(resolve=>{
  const onChange=({playbackState})=>{if(playbackState.currentSong?.videoId==='bbbbbbbbbbb'){s.off('player:songChanged',onChange);resolve(playbackState);}};
  s.on('player:songChanged',onChange);
 });
 const responses=clients.map(waitSong);
 host.emit('player:ended',{videoId:'aaaaaaaaaaa'});
 const states=await Promise.all(responses);
 assert.equal(requests,1);assert.deepEqual(states[0],states[1]);assert.equal(states[0].isPlaying,true);
 assert.equal(states[0].currentSong.recommended,true);
 const result=await ack(host,'player:toggleAutoplay');assert.equal(result.autoplay,false);
 const stopped=new Promise(r=>host.once('player:songChanged',r));
 host.emit('player:ended',{videoId:'bbbbbbbbbbb'});
 assert.equal((await stopped).playbackState.isPlaying,false);assert.equal(requests,1);
 const queueUpdates=clients.map(s=>new Promise(r=>s.once('queue:updated',r)));
 const added=await ack(guest,'queue:autoAdd');assert.equal(added.success,true);
 const updated=await Promise.all(queueUpdates);
 assert.deepEqual(updated[0],updated[1]);
 assert.equal(updated[0].queue.length,3);
 assert.equal(updated[0].currentIndex,1);
 assert.ok(prefetched.includes('ccccccccccc'));
 assert.equal(updated[0].queue[2].videoId,'ccccccccccc');
 const state=await ack(host,'room:join',{roomId});
 assert.equal(state.playbackState.isPlaying,false);
 const denied=await ack(guest,'room:end');assert.equal(denied.success,false);
 const summaries=clients.map(s=>new Promise(r=>s.once('room:ended',r)));
 const ended=await ack(host,'room:end');assert.equal(ended.success,true);
 const received=await Promise.all(summaries);assert.deepEqual(received[0],received[1]);
 assert.deepEqual(received[0].topMembers,[{name:'Tester0',count:1}]);
 assert.equal((await ack(guest,'room:join',{roomId})).success,false);
 assert.equal((await ack(host,'queue:add',{videoId:'ddddddddddd'})).success,false);
});
