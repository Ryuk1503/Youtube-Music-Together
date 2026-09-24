const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createResetHandler } = require('./resetLeaderboard');
const digest = bcrypt.hashSync('test-password', 4);
function response() { return { code: 200, status(code) { this.code=code;return this; }, json(body) { this.body=body;return this; } }; }
test('rejects wrong passwords, throttles attempts and never calls delete', async () => {
  let count=0;
  const handler=createResetHandler({hash:()=>digest,reset:async()=>count++});
  for(let i=0;i<6;i++) {
    const res=response();await handler({ip:'test',body:{password:'wrong'}},res);
    assert.equal(res.code,i===5?429:403);
  }
  assert.equal(count,0);
});
test('successful authentication resets data and broadcasts an update', async () => {
  let count=0, emitted;
  const handler=createResetHandler({hash:()=>digest,reset:async()=>count++});
  const res=response();await handler({ip:'test',body:{password:'test-password'},app:{get:()=>({emit:event=>emitted=event})}},res);
  assert.equal(count,1);assert.equal(res.body.success,true);assert.equal(emitted,'leaderboard:updated');
});
test('unconfigured or failed reset does not claim success', async () => {
  for(const hash of [()=>undefined,()=>digest]) {
    const handler=createResetHandler({hash,reset:async()=>{throw Error('offline');}});
    const res=response();await handler({ip:'test',body:{password:'test-password'}},res);
    assert.equal(res.code,503);assert.ok(!res.body.success);
  }
});
