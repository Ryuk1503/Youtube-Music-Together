import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { subscribeToRoom } from './roomConnection.js';

class Socket extends EventEmitter {
  connected = false;
  requests = [];
  timeout() {
    return { emit: (event, payload, callback) => this.requests.push({ event, payload, callback }) };
  }
}

test('waits for socket readiness, joins with password, and rejoins after reconnect', () => {
  const socket = new Socket();
  const replies = [];
  const payload = { roomId: 'room1', password: 'secret' };
  const stop = subscribeToRoom(socket, payload, r => replies.push(r), assert.fail);
  assert.equal(socket.requests.length, 0);
  socket.connected = true;
  socket.emit('connect');
  assert.deepEqual(socket.requests[0].payload, payload);
  socket.requests[0].callback(null, { success: true });
  socket.connected = false;
  socket.emit('disconnect');
  socket.connected = true;
  socket.emit('connect');
  assert.equal(socket.requests.length, 2);
  socket.requests[0].callback(null, { success: true });
  assert.equal(replies.length, 1);
  socket.requests[1].callback(null, { success: true });
  assert.equal(replies.length, 2);
  stop();
  assert.equal(socket.listenerCount('connect'), 0);
});

test('joins an already connected socket and ignores replies after unmount', () => {
  const socket = new Socket();
  socket.connected = true;
  let leaves = 0;
  socket.on('room:leave', () => leaves++);
  const stop = subscribeToRoom(socket, {}, assert.fail, assert.fail);
  assert.equal(socket.requests.length, 1);
  stop();
  socket.requests[0].callback(null, { success: true });
  assert.equal(leaves, 1);
});

test('reports missing rooms and timeouts instead of leaving the loading screen stuck', () => {
  const socket = new Socket();
  socket.connected = true;
  const errors = [];
  const stop = subscribeToRoom(socket, {}, assert.fail, error => errors.push(error));
  socket.requests[0].callback(null, { success: false, error: 'Room not found' });
  socket.emit('connect');
  socket.requests[1].callback(new Error('timeout'));
  socket.emit('connect_error', new Error('offline'));
  assert.equal(errors[0], 'Room not found');
  assert.equal(errors.length, 3);
  stop();
});
