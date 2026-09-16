import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function GuestPage() {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { createGuest } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    setError('');
    setLoading(true);
    try {
      await createGuest(name);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể bắt đầu phiên khách');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600/20 rounded-2xl mb-4">
            <Music className="w-8 h-8 text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">YouTube Music Together</h1>
          <p className="text-dark-200 mt-1">Nghe nhạc cùng bạn bè</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-700 rounded-2xl p-6 shadow-xl border border-dark-500">
          <h2 className="text-xl font-semibold text-white mb-2">Nhập tên hiển thị</h2>
          <p className="text-dark-200 text-sm mb-6">Tên này sẽ được hiển thị trong phòng và khung chat.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <label htmlFor="display-name" className="block text-sm font-medium text-dark-100 mb-1.5">
            Tên
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full px-4 py-2.5 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
            placeholder="Ví dụ: Minh"
            maxLength={30}
            autoFocus
            required
          />

          <button
            type="submit"
            disabled={loading || !displayName.trim()}
            className="w-full mt-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Play size={18} />
                Bắt đầu nghe nhạc
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
