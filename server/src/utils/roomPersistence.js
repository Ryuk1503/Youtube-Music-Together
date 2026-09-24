const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_FILE = process.env.ROOMS_STATE_FILE || path.join(os.homedir(), '.cache', 'ytm-together', 'rooms.json');

function restoreRoomsFromDisk(file = DEFAULT_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  } catch { return []; }
}

// Rooms only exist in memory, so a host that restarts or kills the app (idle
// suspension, resource limit) would silently drop every room mid-listen. The
// snapshot is the recovery copy: roomManager restores it at boot and connected
// clients rejoin on their own.
function createRoomSnapshotter({ file = DEFAULT_FILE, snapshot, debounceMs = 3000, intervalMs = 15000 } = {}) {
  let lastRooms = '';
  let timer = null;
  let stopped = false;

  function write() {
    let rooms;
    try { rooms = JSON.stringify(snapshot()); }
    catch (error) { console.error('Room snapshot failed:', error.message); return; }
    if (rooms === lastRooms) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, `{"savedAt":${Date.now()},"rooms":${rooms}}`);
      fs.renameSync(`${file}.tmp`, file);
      lastRooms = rooms;
    } catch (error) { console.error('Room snapshot write failed:', error.message); }
  }

  const interval = setInterval(write, intervalMs);
  interval.unref?.();

  return {
    schedule() {
      if (stopped || timer) return;
      timer = setTimeout(() => { timer = null; write(); }, debounceMs);
      timer.unref?.();
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      write();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      clearInterval(interval);
    },
  };
}

module.exports = { DEFAULT_FILE, restoreRoomsFromDisk, createRoomSnapshotter };
