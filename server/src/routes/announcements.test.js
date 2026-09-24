const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { Pool } = require('pg');

test('announcements: 401 anonymous, 403 non-admin post, admin post and read', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = 'announcements_test_' + Date.now();
  const config = { connectionString: process.env.TEST_DATABASE_URL, ssl: { rejectUnauthorized: true } };
  const admin = new Pool(config);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new Pool({ ...config, options: `-c search_path=${schema}` });
  const dbModule = require('../config/db');
  const original = dbModule.pool;
  dbModule.pool = db;
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'https://test.example';
  let server;
  try {
    await require('../utils/accounts').initAccounts(db);
    const { csrfGuard } = require('../middleware/auth');
    const app = express();
    app.use(csrfGuard);
    app.use(express.json());
    app.use('/auth', require('./auth'));
    app.use('/announcements', require('./announcements'));
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, body, cookie = '', method) {
      const res = await fetch(base + path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', 'X-YTM-Request': '1', Origin: 'https://test.example', Cookie: cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return { status: res.status, data: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] };
    }
    const anonGet = await call('/announcements');
    assert.equal(anonGet.status, 401);

    const userReg = await call('/auth/register', { username: 'NormalUser', password: 'p' });
    const userCookie = userReg.cookie;

    const nonAdminPost = await call('/announcements', { title: 'Test', content: 'Content' }, userCookie);
    assert.equal(nonAdminPost.status, 403);

    // Promote to admin
    await db.query(`UPDATE accounts SET is_admin = true WHERE username = 'NormalUser'`);

    const adminPost = await call('/announcements', { title: 'Test Announcement', content: 'Hello World', sender: 'Admin' }, userCookie);
    assert.equal(adminPost.status, 200);
    assert.equal(adminPost.data.announcement.title, 'Test Announcement');

    const listGet = await call('/announcements', null, userCookie);
    assert.equal(listGet.status, 200);
    assert.equal(listGet.data.announcements.length, 1);
    assert.equal(listGet.data.announcements[0].title, 'Test Announcement');
  } finally {
    dbModule.pool = original;
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
