import {
  Play,
  Pause,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Music,
} from 'lucide-react';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function Player({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  volume,
  isHost,
  repeat,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onVolumeChange,
  onToggleRepeat,
  children,
}) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeekChange = (e) => {
    const newTime = (parseFloat(e.target.value) / 100) * duration;
    onSeek(newTime);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value) / 100;
    onVolumeChange(v);
  };

  const toggleMute = () => {
    onVolumeChange(volume > 0 ? 0 : 0.7);
  };

  return (
    <div className="p-5 flex-shrink-0">
      {/* YouTube Player / Thumbnail area */}
      <div className="relative aspect-video bg-dark-600 rounded-xl overflow-hidden mb-4">
        {children}

        {!currentSong && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-dark-300 bg-dark-600 z-10">
            <Music size={48} className="mb-2" />
            <span className="text-sm">Chưa có bài hát nào</span>
          </div>
        )}

        {currentSong && isPlaying && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-full z-10">
            <div className="flex gap-0.5 items-end h-3">
              <div className="w-0.5 bg-primary-400 rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0s' }} />
              <div className="w-0.5 bg-primary-400 rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
              <div className="w-0.5 bg-primary-400 rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }} />
              <div className="w-0.5 bg-primary-400 rounded-full animate-pulse" style={{ height: '80%', animationDelay: '0.6s' }} />
            </div>
            <span className="text-xs text-white">Đang phát</span>
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="mb-4">
        <h3 className="text-white font-semibold text-base truncate">
          {currentSong?.title || 'Chọn bài hát để phát'}
        </h3>
        <p className="text-dark-200 text-sm truncate">
          {currentSong?.author || 'Tìm kiếm và thêm bài hát vào queue'}
        </p>
      </div>

      {/* Seek bar */}
      <div className="mb-4">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeekChange}
          disabled={!isHost || !currentSong}
          className="w-full h-1 disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #5c7cfa ${progress}%, #373a40 ${progress}%)`,
          }}
        />
        <div className="flex justify-between text-xs text-dark-200 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            disabled={isPlaying ? !currentSong : (!isHost || !currentSong)}
            className="w-11 h-11 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-500 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            disabled={!isHost || !currentSong}
            className="w-9 h-9 text-dark-100 hover:text-white disabled:text-dark-400 disabled:cursor-not-allowed hover:bg-dark-600 rounded-full flex items-center justify-center transition"
          >
            <SkipForward size={18} />
          </button>

          {/* Repeat */}
          <button
            onClick={onToggleRepeat}
            disabled={!isHost}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition disabled:cursor-not-allowed ${
              repeat
                ? 'text-primary-400 bg-primary-400/10 hover:bg-primary-400/20'
                : 'text-dark-100 hover:text-white hover:bg-dark-600 disabled:text-dark-400'
            }`}
            title={repeat ? 'Tắt lặp lại' : 'Bật lặp lại'}
          >
            <Repeat size={16} />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <button onClick={toggleMute} className="text-dark-200 hover:text-white transition">
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={volume * 100}
            onChange={handleVolumeChange}
            className="w-20 h-1"
            style={{
              background: `linear-gradient(to right, #5c7cfa ${volume * 100}%, #373a40 ${volume * 100}%)`,
            }}
          />
        </div>
      </div>

      {!isHost && currentSong && (
        <p className="text-xs text-dark-300 text-center mt-3">
          Bạn có thể tạm dừng • Chỉ host mới phát / chuyển bài
        </p>
      )}
    </div>
  );
}
