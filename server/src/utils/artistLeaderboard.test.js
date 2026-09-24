const { test } = require('node:test');
const assert = require('node:assert/strict');
const { saveSession, getLeaderboard } = require('./artistLeaderboard');

test('live leaderboard derives from history, merges channel aliases and splits explicit featuring credits', async () => {
  let rows = [
    { artist: 'Cá Hồi Hoang', elapsed: '10000' },
    { artist: 'Cá Hồi Hoang Official', elapsed: '5000' },
    { artist: 'Cá Hồi Hoang feat Phùng Khánh Linh', elapsed: '3000' },
    { artist: 'Simon & Garfunkel', elapsed: '2000' },
  ];
  const database = { query: async sql => {
    assert.match(sql, /FROM music_playbacks/);
    assert.doesNotMatch(sql, /session_artist_listening/);
    return { rows };
  } };
  let result = await getLeaderboard(database);
  assert.deepEqual(result.map(a => a.elapsedMs), [18000, 3000, 2000]);
  assert.equal(result[1].name, 'Phùng Khánh Linh');
  assert.equal(result[2].name, 'Simon & Garfunkel');
  rows = [{ artist: 'Other', elapsed: '25000' }];
  assert.equal((await getLeaderboard(database))[0].name, 'Other');
  rows = [];
  assert.deepEqual(await getLeaderboard(database), []);
});
test('writes every artist once, skips duplicate sessions, and rolls back failed writes', async () => {
  for (const mode of ['new','duplicate','failure']) {
    const calls=[];let released=false;
    const client={ release(){released=true;}, async query(sql,params){
      calls.push({sql,params});
      if(sql.startsWith('INSERT INTO listening_sessions')) return {rowCount:mode==='duplicate'?0:1};
      if(sql.startsWith('INSERT INTO session_artist') && mode==='failure') throw Error('Database unavailable');
      return {};
    }};
    const task=saveSession({sessionId:'id',artistListening:new Map([['a',{name:'A',elapsedMs:5000}],['b',{name:'B',elapsedMs:2000}]])},{connect:async()=>client});
    if(mode==='failure') { await assert.rejects(task,/unavailable/);assert.equal(calls.at(-1).sql,'ROLLBACK'); }
    else { await task;assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(calls.filter(c=>c.sql.startsWith('INSERT INTO session_artist')).length,mode==='new'?2:0); }
    assert.ok(released);
  }
});
