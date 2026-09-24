const { getListeningTime } = require('./listeningTime');

function buildSessionSummary(room) {
  const { elapsedMs } = getListeningTime(room);
  const leaders = (entries, field) => {
    const values = Array.from(entries?.values() || []);
    const highest = Math.max(0, ...values.map(value => value[field]));
    return values.filter(value => highest > 0 && value[field] === highest);
  };
  return {
    roomId: room.id, roomName: room.name, elapsedMs,
    topArtists: leaders(room.artistListening, 'elapsedMs'),
    topMembers: leaders(room.memberAdditions, 'count'),
  };
}
module.exports = { buildSessionSummary };
