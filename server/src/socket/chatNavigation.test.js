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
    return {id:decoded.userId,username:decoded.username,token_hash:'test-session',is_admin:!!decoded.isAdmin};
  }});
}

const { getRoom, deleteRoom } = require('../utils/roomManager');

test('chat replies use server originals and changing rooms preserves one membership', { timeout: 8000 }, async t => {
  process.env.JWT_SECRET = 'chat-test';
  const server = http.createServer(); const io = new Server(server);
  setupSocket(io, { artistMetadata: async () => null, prefetch: () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const sockets = [], roomIds = [];
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    roomIds.forEach(deleteRoom);
  });
  for (const username of ['Alice', 'Bob']) {
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'],
      auth: { token: jwt.sign({ userId: username, username, isAdmin: username === 'Alice' }, process.env.JWT_SECRET) } });
    sockets.push(socket);
    await new Promise(resolve => socket.once('connect', resolve));
  }
  const [alice, bob] = sockets;
  const ack = (socket, event, data) => socket.timeout(2000).emitWithAck(event, data);
  const first = (await ack(alice, 'room:create', { name: 'First' })).room.id; roomIds.push(first);
  await ack(bob, 'room:join', { roomId: first });
  let received = new Promise(resolve => bob.once('chat:message', resolve));
  alice.emit('chat:message', { text: 'Original' });
  const original = await received; assert.ok(original.id);
  assert.equal(original.isAdmin, true, 'admin decoration travels with the message');
  received = new Promise(resolve => alice.once('chat:message', resolve));
  bob.emit('chat:message', { text: 'Reply', replyToId: original.id, replyTo: { text: 'forged' } });
  const reply = await received;
  assert.deepEqual(reply.replyTo, { id: original.id, username: 'Alice', text: 'Original' });
  assert.equal(reply.username, 'Bob');
  assert.equal(reply.isAdmin, false);
  const rejoined = await ack(bob, 'room:join', { roomId: first });
  assert.deepEqual(rejoined.messages[1], reply);
  assert.equal(original.userId, 'Alice');
  assert.equal((await ack(bob, 'chat:edit', { messageId: original.id, text: 'forged', userId: 'Alice' })).success, false);
  assert.equal((await ack(bob, 'chat:delete', { messageId: original.id })).success, false);
  assert.equal((await ack(alice, 'chat:edit', { messageId: original.id, text: '   ' })).success, false);
  assert.equal((await ack(alice, 'chat:edit', { messageId: original.id, text: 'x'.repeat(501) })).success, false);
  await ack(bob, 'chat:heart', { messageId: original.id, liked: true });
  await ack(bob, 'chat:heart', { messageId: original.id, liked: true });
  assert.deepEqual(getRoom(first).messages[0].hearts, ['Bob'], 'retries do not duplicate hearts');
  await ack(alice, 'chat:heart', { messageId: original.id, liked: true });
  await ack(bob, 'chat:heart', { messageId: original.id, liked: false });
  assert.deepEqual(getRoom(first).messages[0].hearts, ['Alice']);
  received = new Promise(resolve => bob.once('chat:updated', resolve));
  assert.equal((await ack(alice, 'chat:edit', { messageId: original.id, text: 'Edited' })).success, true);
  const edited = (await received).messages;
  assert.equal(edited[0].text, 'Edited'); assert.ok(edited[0].editedAt);
  assert.equal(edited[1].replyTo.text, 'Edited');
  received = new Promise(resolve => bob.once('chat:updated', resolve));
  assert.equal((await ack(alice, 'chat:delete', { messageId: original.id })).success, true);
  const deleted = (await received).messages;
  assert.equal(deleted.length, 1); assert.equal(deleted[0].replyTo.deleted, true);
  assert.equal(deleted[0].replyTo.text, '');
  assert.equal((await ack(alice, 'chat:heart', { messageId: original.id, liked: true })).success, false);
  const second = (await ack(alice, 'room:create', { name: 'Second', password: 'secret' })).room.id; roomIds.push(second);
  assert.equal(getRoom(first).members.has(alice.id), false);
  assert.equal(getRoom(first).hostSocketId, bob.id);
  assert.equal((await ack(bob, 'room:join', { roomId: second, password: 'wrong' })).success, false);
  assert.equal(getRoom(first).members.has(bob.id), true, 'failed join keeps existing membership');
  await ack(bob, 'room:join', { roomId: second, password: 'secret' });
  bob.emit('room:leave', { roomId: first });
  await ack(bob, 'room:join', { roomId: second, password: 'secret' });
  assert.equal(getRoom(first).members.has(bob.id), false);
  assert.equal(getRoom(second).members.has(bob.id), true, 'late cleanup must not leave the new room');
  assert.equal((await ack(bob, 'chat:edit', { messageId: reply.id, text: 'Wrong room' })).success, false);
  received = new Promise(resolve => alice.once('chat:message', resolve));
  bob.emit('chat:message', { text: 'Cross-room reply', replyToId: original.id });
  assert.equal((await received).replyTo, null);
});
