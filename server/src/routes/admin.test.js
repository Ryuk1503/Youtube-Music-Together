const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { Pool } = require('pg');

test('admin routes: 401 anonymous, 403 non-admin, accounts with notes, room history sessions', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = 'admin_routes_' + Date.now();
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
    await require('../utils/roomHistory').initRoomHistory(db);
    const { csrfGuard } = require('../middleware/auth');
    const app = express();
    app.use(csrfGuard);
    app.use(express.json());
    app.use('/auth', require('./auth'));
    app.use('/admin', require('./admin'));
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, body, cookie = '', method, extra = {}) {
      const res = await fetch(base + path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', 'X-YTM-Request': '1', Origin: 'https://test.example', Cookie: cookie, ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return { status: res.status, data: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] };
    }
    const password = 'a';
    const boss = await call('/auth/register', { username: 'Boss', password });
    const plain = await call('/auth/register', { username: 'Plain', password });
    assert.equal(boss.status, 201);
    assert.equal(plain.status, 201);
    assert.equal(boss.data.user.isAdmin, false);
    assert.equal((await call('/admin/accounts')).status, 401);
    assert.equal((await call('/admin/accounts', null, plain.cookie)).status, 403);
    assert.equal((await call('/admin/room-history', null, plain.cookie)).status, 403);
    await db.query('UPDATE accounts SET is_admin=true WHERE id=$1', [boss.data.user.id]);
    const accounts = await call('/admin/accounts', null, boss.cookie);
    assert.equal(accounts.status, 200);
    assert.equal(accounts.data.total, 2);
    assert.deepEqual(accounts.data.accounts.map(account => account.username).sort(), ['Boss', 'Plain']);
    assert.equal(accounts.data.accounts.every(account => account.notes === '0'), true);
    assert.equal(accounts.data.accounts.every(account => 'password_hash' in account === false && 'token_hash' in account === false), true);
    const empty = await call('/admin/room-history', null, boss.cookie);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data.sessions, []);
    await db.query(
      `INSERT INTO room_history(session_id, room_id, room_name, owner_user_id, owner_name, opened_at, closed_at, close_reason, members)
       VALUES($1, 'abcd1234', 'Phòng vui', $2, 'Boss', now(), now() + interval '90 minutes', 'ttl', $3)`,
      ['33333333-3333-4333-8333-333333333333', boss.data.user.id, JSON.stringify([{ userId: boss.data.user.id, username: 'Boss' }])]
    );
    const history = await call('/admin/room-history', null, boss.cookie);
    assert.equal(history.status, 200);
    assert.equal(history.data.sessions.length, 1);
    const session = history.data.sessions[0];
    assert.equal(session.room_name, 'Phòng vui');
    assert.equal(session.owner_name, 'Boss');
    assert.equal(session.close_reason, 'ttl');
    assert.notEqual(session.closed_at, null);
    assert.deepEqual(session.members, [{ userId: boss.data.user.id, username: 'Boss' }]);
    const paged = await call('/admin/accounts?limit=1', null, boss.cookie);
    assert.equal(paged.status, 200);
    assert.equal(paged.data.accounts.length, 1);
    assert.equal(paged.data.total, 2);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    dbModule.pool = original;
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await original.end();
  }
});
