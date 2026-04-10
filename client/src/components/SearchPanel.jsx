import { useState } from 'react';
import api from '../api';
import { Search, X, Plus, Loader2 } from 'lucide-react';

export default function SearchPanel({ onAddToQueue }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await api.get('/youtube/search', { params: { q: query.trim() } });
      setResults(res.data.videos || []);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  const handleAdd = (video) => {
    onAddToQueue({
      videoId: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
      duration: video.duration,
      author: video.author,
    });
  };

  return (
    <div className="flex flex-col border-b border-dark-500 max-h-[50%]">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="p-4 flex-shrink-0">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-300 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition text-sm"
              placeholder="Tìm kiếm bài hát..."
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white transition"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-500 disabled:cursor-not-allowed text-white rounded-lg transition text-sm font-medium flex-shrink-0"
          >
            Tìm
          </button>
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <p className="text-dark-300 text-sm text-center py-8">Không tìm thấy kết quả</p>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            {results.map((video) => (
              <div
                key={video.videoId}
                onClick={() => handleAdd(video)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-600 cursor-pointer group transition"
              >
                <img
                  src={video.thumbnail}
                  alt=""
                  className="w-16 h-12 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">{video.title}</p>
                  <p className="text-xs text-dark-200 truncate">
                    {video.author} • {video.duration}
                  </p>
                </div>
                <Plus size={18} className="flex-shrink-0 text-dark-300 group-hover:text-primary-400 transition" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
