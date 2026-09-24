const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { fetchSearchPage } = require('./youtubeHttp');

test('uses IPv4, passes cancellation, and preserves split UTF-8 characters', async () => {
  const signal = AbortSignal.timeout(1000);
  const response = new EventEmitter();
  response.statusCode = 200;
  const promise = fetchSearchPage(new URL('https://www.youtube.com/results'), { signal }, (url, options, callback) => {
    assert.equal(options.family, 4);
    assert.equal(options.signal, signal);
    const req = new EventEmitter();
    queueMicrotask(() => {
      callback(response);
      const bytes = Buffer.from('Chốn Sa Mạc');
      response.emit('data', bytes.subarray(0, 3));
      response.emit('data', bytes.subarray(3));
      response.emit('end');
    });
    return req;
  });
  const result = await promise;
  assert.equal(result.ok, true);
  assert.equal(await result.text(), 'Chốn Sa Mạc');
});

test('propagates request failures instead of returning empty search results', async () => {
  await assert.rejects(fetchSearchPage('https://www.youtube.com/results', {}, () => {
    const req = new EventEmitter();
    queueMicrotask(() => req.emit('error', new Error('Network failed')));
    return req;
  }), /Network failed/);
});

test('exposes upstream HTTP errors and rejects truncated responses', async () => {
  for (const interrupted of [false, true]) {
    const promise = fetchSearchPage('https://www.youtube.com/results', {}, (url, options, callback) => {
      const req = new EventEmitter();
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = 429;
        callback(response);
        response.emit(interrupted ? 'aborted' : 'end');
      });
      return req;
    });
    if (interrupted) await assert.rejects(promise, /interrupted/);
    else { const result = await promise; assert.equal(result.ok, false); assert.equal(result.status, 429); }
  }
});
