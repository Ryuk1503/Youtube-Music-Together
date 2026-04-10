import { ListMusic, X, Music } from 'lucide-react';

export default function Queue({ queue, currentIndex, onRemove }) {
  const upcoming = queue.slice(currentIndex + 1);
  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-dark-500 flex-shrink-0">
        <ListMusic size={18} className="text-primary-400" />
        <h3 className="text-white font-semibold text-sm">
          Hàng đợi ({queue.length} bài)
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dark-300">
            <Music size={36} className="mb-3" />
            <p className="text-sm">Chưa có bài hát trong hàng đợi</p>
            <p className="text-xs text-dark-400 mt-1">Tìm kiếm và thêm bài hát phía trên</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Currently playing */}
            {currentSong && (
              <div className="mb-3">
                <p className="text-xs text-dark-300 uppercase font-semibold tracking-wider mb-2">
                  Đang phát
                </p>
                <div className="flex items-center gap-3 p-2.5 bg-primary-600/10 border border-primary-600/20 rounded-lg">
                  <img
                    src={currentSong.thumbnail}
                    alt=""
                    className="w-12 h-9 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{currentSong.title}</p>
                    <p className="text-xs text-dark-200 truncate">
                      {currentSong.author} • Thêm bởi {currentSong.addedBy}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming songs */}
            {upcoming.length > 0 && (
              <div>
                <p className="text-xs text-dark-300 uppercase font-semibold tracking-wider mb-2">
                  Tiếp theo ({upcoming.length})
                </p>
                <div className="space-y-1">
                  {upcoming.map((song, i) => {
                    const actualIndex = currentIndex + 1 + i;
                    return (
                      <div
                        key={`${song.videoId}-${actualIndex}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-600 group transition"
                      >
                        <span className="w-5 text-xs text-dark-300 text-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <img
                          src={song.thumbnail}
                          alt=""
                          className="w-10 h-7 rounded object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{song.title}</p>
                          <p className="text-xs text-dark-200 truncate">
                            {song.author} • {song.addedBy}
                          </p>
                        </div>
                        <button
                          onClick={() => onRemove(actualIndex)}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-dark-300 hover:text-red-400 hover:bg-red-400/10 rounded opacity-0 group-hover:opacity-100 transition"
                          title="Xóa khỏi hàng đợi"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
