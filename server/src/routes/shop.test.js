const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const express = require('express');
const { initAccounts } = require('../utils/accounts');

test('shop transactions: authentication, prices, atomic inventory, retries, ID uniqueness, fixed wallet and account isolation', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = 'shop_test_' + Date.now();
  const config = { connectionString: process.env.TEST_DATABASE_URL, ssl: { rejectUnauthorized: true } };
  const admin = new Pool(config);
  const dbModule = require('../config/db');
  const original = dbModule.pool;
  let db, server;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({ ...config, options: `-c search_path=${schema}` });
    dbModule.pool = db;
    await initAccounts(db);
    const auth = require('../middleware/auth');
    process.env.NODE_ENV = 'test';
    const app = express(); app.use(express.json()); app.use(auth.csrfGuard); app.use('/shop', require('./shop'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    async function account(name, notes, fixed = null) {
      const id = randomUUID();
      await db.query('INSERT INTO accounts(id,username,name_key,public_id,password_hash) VALUES($1,$2,$2,$2,$2)', [id, name]);
      await db.query('INSERT INTO account_profiles(id,display_name,notes,fixed_notes) VALUES($1,$2,$3,$4)', [id, name, notes, fixed]);
      return { id, cookie: 'ytm_session=' + await auth.createSession(db, id) };
    }
    const a = await account('alice', 90), b = await account('bob', 60), poor = await account('poor', 0), fixed = await account('fixed', 999, 999);
    async function call(user, path, body, csrf = true) {
      const response = await fetch(base + '/shop' + path, { method: body ? 'POST' : 'GET', headers: {
        'Content-Type': 'application/json', ...(csrf ? { 'X-YTM-Request': '1' } : {}), Cookie: user?.cookie || '',
      }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    }
    const buy = () => ({ itemId: 'id-change-card', requestId: randomUUID() });
    const use = newId => ({ ...buy(), newId });
    const balance = async user => (await db.query('SELECT notes FROM account_profiles WHERE id=$1', [user.id])).rows[0].notes;
    assert.equal((await call(null, '')).status, 401);
    assert.equal((await call(a, '/buy', buy(), false)).status, 403);
    assert.equal((await call(a, '')).body.items[0].price, 30);
    assert.equal((await call(poor, '/buy', buy())).status, 400);
    assert.equal((await call(poor, '/use', use('new-poor'))).status, 400);
    const request = { ...buy(), price: 0, accountId: b.id };
    const purchases = await Promise.all([call(a, '/buy', request), call(a, '/buy', request)]);
    assert.ok(purchases.every(r => r.status === 200));
    assert.equal(await balance(a), '60'); assert.equal(await balance(b), '60');
    assert.equal((await call(a, '/inventory')).body.items[0].quantity, 1);
    assert.equal((await call(a, '/use', { ...request, newId: 'new-name' })).status, 409);
    for (const id of ['bob', 'ALICE', 'ytmt-99', 'has space', 'admindeptrai', 'lycutihihi']) {
      assert.ok((await call(a, '/use', use(id))).status >= 400);
    }
    assert.equal((await call(a, '/inventory')).body.items[0].quantity, 1);
    const change = use('  New-Alice  ');
    const changes = await Promise.all([call(a, '/use', change), call(a, '/use', change)]);
    assert.ok(changes.every(r => r.status === 200));
    assert.equal(changes[0].body.publicId, 'new-alice');
    assert.equal((await call(a, '/inventory')).body.items.length, 0);
    assert.equal((await call(a, '/inventory')).body.publicId, 'new-alice');
    assert.equal((await db.query('SELECT username FROM accounts WHERE id=$1', [a.id])).rows[0].username, 'alice');
    assert.equal((await call(a, '/use', use('another-id'))).status, 400);
    await call(a, '/buy', buy()); await call(b, '/buy', buy());
    const collision = await Promise.all([call(a, '/use', use('same-target')), call(b, '/use', use('SAME-TARGET'))]);
    assert.deepEqual(collision.map(r => r.status).sort(), [200, 409]);
    const totalCards = (await db.query('SELECT sum(quantity) FROM account_inventory WHERE account_id=ANY($1::uuid[])', [[a.id, b.id]])).rows[0].sum;
    assert.equal(totalCards, '1');
    assert.equal((await call(fixed, '/buy', buy())).status, 200);
    assert.equal(await balance(fixed), '999');
    assert.equal((await call(fixed, '/use', use('new-fixed'))).status, 200);
    assert.equal(await balance(fixed), '999');
    assert.equal((await call(poor, '/inventory')).body.items.length, 0);
    const bulk = await account('bulk', 300);
    const bulkRequest = { ...buy(), quantity: 5, price: 1, total: 1 };
    const bulkResults = await Promise.all([call(bulk, '/buy', bulkRequest), call(bulk, '/buy', bulkRequest)]);
    assert.ok(bulkResults.every(result => result.status === 200));
    assert.equal(bulkResults[0].body.purchased, 5);
    assert.equal(await balance(bulk), '150');
    assert.equal((await call(bulk, '/inventory')).body.items[0].quantity, 5);
    assert.equal((await call(bulk, '/buy', { ...bulkRequest, quantity: 4 })).status, 409);
    assert.equal((await call(bulk, '/buy', { ...buy(), quantity: 6 })).status, 400);
    for (const quantity of [0, -1, 1.5, '5', null, 2147483648]) {
      assert.equal((await call(bulk, '/buy', { ...buy(), quantity })).status, 400);
    }
    assert.equal(await balance(bulk), '150');
    assert.equal((await call(bulk, '/buy', { ...buy(), quantity: 5 })).status, 200);
    assert.equal(await balance(bulk), '0');
    assert.equal((await call(bulk, '/inventory')).body.items[0].quantity, 10);
    assert.equal((await call(fixed, '/buy', { ...buy(), quantity: 50 })).status, 200);
    assert.equal(await balance(fixed), '999');
  } finally {
    await new Promise(resolve => server ? server.close(resolve) : resolve());
    dbModule.pool = original;
    await db?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
