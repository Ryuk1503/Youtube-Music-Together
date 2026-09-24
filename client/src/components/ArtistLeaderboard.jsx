import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function ArtistLeaderboard({ socket }) {
  const { user } = useAuth();
  const [artists, setArtists] = useState([]);
  const [status, setStatus] = useState('loading');
  const [showReset, setShowReset] = useState(false);
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [revision, setRevision] = useState(0);
  const resetDatabase = async event => {
    event.preventDefault();
    if (resetting) return;
    setResetting(true);
    setResetError('');
    try {
      await api.post('/rooms/leaderboard/reset', { password });
      setPassword('');
      setShowReset(false);
      setArtists([]);
      setStatus('ready');
      setRevision(value => value + 1);
    } catch (error) { setResetError(error.response?.data?.error || 'Không thể xóa dữ liệu lúc này.'); }
    finally { setResetting(false); }
  };
  useEffect(() => {
    let active = true, request = 0;
    const load = async () => {
      const id = ++request;
      try {
        const result = await api.get('/rooms/leaderboard');
        if (active && id === request) { setArtists(result.data.artists); setStatus('ready'); }
      } catch { if (active && id === request) setStatus('error'); }
    };
    load();
    socket?.on('leaderboard:updated', load);
    socket?.on('connect', load);
    return () => { active = false; socket?.off('leaderboard:updated', load); socket?.off('connect', load); };
  }, [socket, revision]);
  const duration = ms => {
    const seconds = Math.floor(ms / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
  };
  return (
    <section className="mb-8" aria-labelledby="leaderboard-heading">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 id="leaderboard-heading" className="text-xl font-semibold text-white">BXH Nghệ sĩ được nghe nhiều nhất</h2>
        {user?.isAdmin && <button onClick={() => { setShowReset(true); setResetError(''); setPassword(''); }}
          className="text-sm text-red-400 border border-red-400/40 rounded-lg px-3 py-2 hover:bg-red-400/10">Xóa database</button>}
      </div>
      {showReset && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <form onSubmit={resetDatabase} role="dialog" aria-modal="true" aria-labelledby="reset-title"
          className="w-full max-w-md rounded-2xl bg-dark-800 border border-dark-500 p-6">
          <h3 id="reset-title" className="text-xl font-semibold text-white text-center">Xóa database</h3>
          <label className="block text-sm text-dark-100 mt-4" htmlFor="reset-password">Mật khẩu xác nhận</label>
          <input id="reset-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
            autoFocus autoComplete="off" required maxLength={72} disabled={resetting}
            className="w-full mt-2 p-2.5 rounded-lg border border-dark-400 bg-dark-600 text-white focus:outline-none focus:border-primary-500" />
          {resetError && <p role="alert" className="text-red-400 text-sm mt-3">{resetError}</p>}
          <div className="flex gap-3 mt-5">
            <button type="button" disabled={resetting} onClick={() => { setShowReset(false); setPassword(''); }} className="flex-1 py-2 rounded-lg bg-dark-500 text-white">Hủy</button>
            <button type="submit" disabled={resetting || !password} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white">{resetting ? 'Đang xóa…' : 'Xác nhận xóa'}</button>
          </div>
        </form>
      </div>}
      {status === 'loading' && <p className="text-dark-200 text-sm mt-4">Đang tải bảng xếp hạng…</p>}
      {status === 'error' && <p role="status" className="text-dark-200 text-sm mt-4">Chưa tải được bảng xếp hạng. Hãy tải lại trang để thử lại.</p>}
      {status === 'ready' && (artists.length ? <ol className="mt-4 divide-y divide-dark-500">
        {artists.map((artist, index) => <li key={artist.key} className="flex items-center gap-3 py-3">
          <span className="text-primary-400 font-semibold w-6 shrink-0">{index + 1}</span>
          <span className="text-white flex-1 min-w-0 break-words">{artist.name}</span>
          <span className="text-dark-100 tabular-nums text-sm shrink-0">{duration(artist.elapsedMs)}</span>
        </li>)}
      </ol> : <p className="text-dark-200 text-sm mt-4">Hiện chưa có dữ liệu để xếp hạng.</p>)}
    </section>
  );
}
