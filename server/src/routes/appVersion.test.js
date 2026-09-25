const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const appVersion = require('./appVersion');

test('GET /api/app/version returns valid version metadata', async () => {
  const app = express();
  app.use('/api/app', appVersion);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/app/version`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(typeof data.versionCode, 'number');
    assert.equal(typeof data.versionName, 'string');
    assert.equal(typeof data.apkUrl, 'string');
    assert.ok(data.apkUrl.includes('YTM-Together.apk'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
