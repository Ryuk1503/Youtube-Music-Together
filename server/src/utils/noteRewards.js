const { randomUUID } = require('node:crypto');
const NOTE_INTERVAL_MS = 600000;

// Union server-clock intervals: the same account in several rooms/tabs earns once.
function mergeIntervals(intervals) {
  const merged = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function createNoteRewards({ persist, sample, notify = () => {} }) {
  let intervals = new Map();
  let pending = null;
  let inFlight = null;
  function record(room, start, end) {
    for (const accountId of new Set([...room.members.values()].map(member => member.userId))) {
      intervals.set(accountId, mergeIntervals([...(intervals.get(accountId) || []), [start, end]]));
    }
  }
  async function drain() {
    // Sample ALL rooms at one boundary before detaching a batch, so intervals
    // from separate rooms cannot overlap across different database batches.
    sample(Date.now());
    if (!pending && intervals.size) {
      pending = { id: randomUUID(), entries: [...intervals].map(([accountId, spans]) => ({
        accountId, elapsedMs: spans.reduce((sum, [start, end]) => sum + end - start, 0),
      })) };
      intervals = new Map();
    }
    if (!pending) return;
    const updates = await persist(pending);
    pending = null;
    for (const update of updates) notify(update);
  }
  function flush() {
    if (!inFlight) inFlight = drain().finally(() => { inFlight = null; });
    return inFlight;
  }
  return { record, flush };
}

async function persistNoteRewards(pool, batch) {
  const db = await pool.connect();
  const updates = [];
  try {
    await db.query('BEGIN');
    for (const { accountId, elapsedMs } of [...batch.entries].sort((a, b) => a.accountId.localeCompare(b.accountId))) {
      // Lock the wallet; ledger, fractional progress and balance commit together.
      const wallet = await db.query('SELECT notes, fixed_notes FROM account_profiles WHERE id=$1 FOR UPDATE', [accountId]);
      if (!wallet.rowCount || wallet.rows[0].fixed_notes != null) continue;
      const inserted = await db.query(`INSERT INTO account_note_rewards(batch_id, account_id, elapsed_ms, awarded_notes)
        VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING RETURNING account_id`, [batch.id, accountId, elapsedMs]);
      if (!inserted.rowCount) continue; // Safe retry even if COMMIT succeeded but its reply was lost.
      await db.query('INSERT INTO account_note_progress(account_id) VALUES($1) ON CONFLICT DO NOTHING', [accountId]);
      const progress = await db.query('SELECT remainder_ms FROM account_note_progress WHERE account_id=$1 FOR UPDATE', [accountId]);
      const total = BigInt(progress.rows[0].remainder_ms) + BigInt(elapsedMs);
      const awarded = total / BigInt(NOTE_INTERVAL_MS);
      await db.query('UPDATE account_note_progress SET remainder_ms=$2 WHERE account_id=$1', [accountId, String(total % BigInt(NOTE_INTERVAL_MS))]);
      await db.query('UPDATE account_note_rewards SET awarded_notes=$3 WHERE batch_id=$1 AND account_id=$2', [batch.id, accountId, String(awarded)]);
      if (awarded > 0n) {
        const result = await db.query('UPDATE account_profiles SET notes=notes+$2, updated_at=now() WHERE id=$1 RETURNING notes', [accountId, String(awarded)]);
        updates.push({ userId: accountId, notes: result.rows[0].notes, earned: String(awarded) });
      }
    }
    await db.query('COMMIT');
    return updates;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
module.exports = { createNoteRewards, persistNoteRewards, mergeIntervals, NOTE_INTERVAL_MS };
