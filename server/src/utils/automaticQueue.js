const { addToQueue, isRestricted } = require('./roomManager');
const { getRecommendations } = require('./recommendations');
const { chooseRecommendation } = require('./artistPreference');

async function addAutomaticSong(room, socketId, user, { recommend = getRecommendations, isCurrent = () => true } = {}) {
  const current = room.queue[room.currentIndex];
  if (!current) return { success: false, error: 'Hãy chọn bài đầu tiên trước khi tự động thêm.' };
  if (isRestricted(room, user.userId)) return { success: false, error: 'Bạn đã bị hạn chế thêm nhạc.' };
  if (room.autoAdding) return { success: false, error: 'Phòng đang tìm bài. Vui lòng chờ một chút.' };
  room.autoAdding = true;
  try {
    const candidates = await recommend(current.videoId);
    if (!isCurrent() || room.ending || !room.members.has(socketId) || room.queue[room.currentIndex] !== current) {
      return { success: false, error: 'Phòng hoặc bài đang phát đã thay đổi. Vui lòng thử lại.' };
    }
    const excluded = new Set([...room.queue.map(song => song.videoId), ...(room.recentVideoIds || [])]);
    const song = chooseRecommendation(room, current, candidates, excluded);
    if (!song) return { success: false, error: 'Chưa tìm được đề xuất mới từ YouTube. Vui lòng thử lại sau.' };
    const result = addToQueue(room, { ...song, recommended: true, addedBy: user.username }, user.userId);
    if (result === 'restricted') return { success: false, error: 'Bạn đã bị hạn chế thêm nhạc.' };
    if (!result) return { success: false, error: 'Hàng đợi đã đầy.' };
    return { success: true };
  } catch {
    return { success: false, error: 'Không lấy được đề xuất YouTube. Vui lòng thử lại.' };
  } finally {
    room.autoAdding = false;
  }
}

module.exports = { addAutomaticSong };
