import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SiteHeader from '../components/SiteHeader';
import MemberProfileCard from '../components/MemberProfileCard';
import { Mail, Send } from 'lucide-react';
import api from '../api';

const PREVIEW_COUNT = 5;

function formatTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(from, to) {
  if (!from || !to) return '—';
  const minutes = Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [accountsError, setAccountsError] = useState('');
  const [fullAccounts, setFullAccounts] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annSender, setAnnSender] = useState('RYUK');
  const [annSending, setAnnSending] = useState(false);
  const [annStatus, setAnnStatus] = useState({ type: '', message: '' });

  async function handleSendAnnouncement(e) {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) return;
    setAnnSending(true);
    setAnnStatus({ type: '', message: '' });
    try {
      await api.post('/announcements', {
        title: annTitle.trim(),
        content: annContent.trim(),
        sender: annSender.trim() || 'Ban Quản Trị',
      });
      setAnnStatus({ type: 'success', message: 'Đã gửi thông báo thành công tới toàn bộ người dùng!' });
      setAnnTitle('');
      setAnnContent('');
    } catch (err) {
      setAnnStatus({ type: 'error', message: err.response?.data?.error || 'Chưa gửi được thông báo.' });
    } finally {
      setAnnSending(false);
    }
  }

  const [selected, setSelected] = useState(null);
  const closeTimer = useRef(null);
  const closeProfile = useCallback(() => { clearTimeout(closeTimer.current); setSelected(null); }, []);
  const keepProfile = () => clearTimeout(closeTimer.current);
  const deferClose = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setSelected(null), 180); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const openProfile = (account, element, modal) => {
    keepProfile();
    setSelected({
      member: { userId: account.id, username: account.username },
      anchor: element.getBoundingClientRect(),
      modal,
      profileUrl: `/admin/accounts/${encodeURIComponent(account.id)}/profile`,
    });
  };

  useEffect(() => {
    let active = true;
    api.get('/admin/accounts', { params: { limit: PREVIEW_COUNT } })
      .then(({ data }) => { if (active) setAccounts(data); })
      .catch(() => { if (active) setAccountsError('Chưa tải được danh sách tài khoản.'); });
    api.get('/admin/room-history')
      .then(({ data }) => { if (active) setSessions(data); })
      .catch(() => { if (active) setSessionsError('Chưa tải được lịch sử phòng.'); });
    return () => { active = false; };
  }, []);

  if (!user?.isAdmin) return <Navigate to="/" replace />;

  async function expand() {
    if (fullAccounts || expanding) { setExpanded(true); return; }
    setExpanding(true);
    try {
      const { data } = await api.get('/admin/accounts', { params: { limit: 500 } });
      setFullAccounts(data);
      setExpanded(true);
    } catch {
      setAccountsError('Chưa tải được danh sách tài khoản.');
    } finally {
      setExpanding(false);
    }
  }

  const accountList = expanded && fullAccounts ? fullAccounts.accounts : accounts?.accounts;
  const sessionList = sessions?.sessions || [];

  return <div className="min-h-screen bg-dark-900 text-dark-100">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>

      <section className="mt-6 rounded-xl border-2 border-dark-500 bg-dark-800 p-6">
        <h3 className="border-b border-dark-500 pb-3 text-lg font-semibold text-white">Tài khoản</h3>
        {accountsError && <p role="alert" className="mt-4 text-sm text-red-400">{accountsError}</p>}
        {!accounts && !accountsError && <p className="mt-4 text-sm text-dark-200">Đang tải…</p>}
        {accounts && <>
          <p className="mt-4 text-sm">Tổng số tài khoản: <span className="font-medium text-white">{accounts.total.toLocaleString('vi-VN')}</span></p>
          {accountList?.length ? <ul className="mt-3 space-y-2">
            {accountList.map(account => (
              <li key={account.public_id}>
                <button
                  type="button"
                  aria-label={`Xem hồ sơ ${account.username}`}
                  className="rounded-lg px-2 py-1 text-sm text-dark-200 hover:bg-dark-600 hover:text-white focus-visible:outline focus-visible:outline-primary-400"
                  onPointerEnter={event => { if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover)').matches) openProfile(account, event.currentTarget, false); }}
                  onPointerLeave={() => { if (!selected?.modal) deferClose(); }}
                  onClick={event => openProfile(account, event.currentTarget, !window.matchMedia('(hover: hover) and (pointer: fine)').matches)}
                  onKeyDown={event => { if (event.key === 'Escape') closeProfile(); }}
                >
                  {account.username}
                </button>
              </li>
            ))}
          </ul> : <p className="mt-3 text-sm text-dark-200">Chưa có tài khoản nào.</p>}
          {accounts.total > accountList?.length && !expanded && (
            <button onClick={expand} disabled={expanding} className="mt-4 rounded-lg bg-dark-600 px-4 py-2 text-sm text-white hover:bg-dark-500 disabled:opacity-50">
              {expanding ? 'Đang tải…' : 'Mở rộng'}
            </button>
          )}
          {expanded && fullAccounts && accounts.total > PREVIEW_COUNT && (
            <button onClick={() => setExpanded(false)} className="mt-4 rounded-lg bg-dark-600 px-4 py-2 text-sm text-white hover:bg-dark-500">Thu gọn</button>
          )}
        </>}
      </section>

      <section className="mt-6 rounded-xl border-2 border-dark-500 bg-dark-800 p-6">
        <h3 className="border-b border-dark-500 pb-3 text-lg font-semibold text-white">Lịch sử phòng nghe</h3>
        {sessionsError && <p role="alert" className="mt-4 text-sm text-red-400">{sessionsError}</p>}
        {!sessions && !sessionsError && <p className="mt-4 text-sm text-dark-200">Đang tải…</p>}
        {sessions && !sessionList.length && <p className="mt-4 text-sm text-dark-200">Chưa có phòng nào được ghi lại.</p>}
        {sessionList.length > 0 && <ul className="mt-4 space-y-5">
          {sessionList.map(session => (
            <li key={session.session_id}>
              <p className="text-sm font-medium text-white">{session.room_name}</p>
              <p className="mt-1 text-sm text-dark-200">
                Mở: {formatTime(session.opened_at) || '—'} · Đóng: {session.closed_at ? formatTime(session.closed_at) : 'Đang mở'} · Kéo dài: {session.closed_at ? formatDuration(session.opened_at, session.closed_at) : '—'}
              </p>
              <p className="mt-1 text-sm text-dark-200">Chủ phòng: {session.owner_name}</p>
              <p className="mt-1 text-sm text-dark-200">Thành viên: {(session.members || []).map(member => member.username).join(', ') || '—'}</p>
            </li>
          ))}
        </ul>}
      </section>

      {/* Gửi thông báo Hòm thư */}
      <section className="mt-6 rounded-xl border-2 border-dark-500 bg-dark-800 p-6">
        <h3 className="border-b border-dark-500 pb-3 text-lg font-semibold text-white flex items-center gap-2">
          <Mail size={20} className="text-primary-400" />
          Gửi thư thông báo toàn hệ thống (Hòm thư)
        </h3>

        {annStatus.message && (
          <p role="alert" className={`mt-4 text-sm ${annStatus.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {annStatus.message}
          </p>
        )}

        <form onSubmit={handleSendAnnouncement} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Tiêu đề thư</label>
            <input
              type="text"
              value={annTitle}
              onChange={e => setAnnTitle(e.target.value)}
              placeholder="VD: Thông báo cập nhật hệ thống"
              required
              maxLength={200}
              className="w-full rounded-lg bg-dark-700 border border-dark-500 px-3.5 py-2 text-sm text-white placeholder-dark-300 focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Ký tên</label>
            <input
              type="text"
              value={annSender}
              onChange={e => setAnnSender(e.target.value)}
              placeholder="RYUK"
              maxLength={100}
              className="w-full sm:w-72 rounded-lg bg-dark-700 border border-dark-500 px-3.5 py-2 text-sm text-white placeholder-dark-300 focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Nội dung thư</label>
            <textarea
              value={annContent}
              onChange={e => setAnnContent(e.target.value)}
              placeholder="Nhập nội dung thư muốn gửi tới toàn bộ người dùng..."
              required
              rows={4}
              maxLength={5000}
              className="w-full rounded-lg bg-dark-700 border border-dark-500 p-3.5 text-sm text-white placeholder-dark-300 focus:outline-none focus:border-primary-500 leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={annSending || !annTitle.trim() || !annContent.trim()}
            className="rounded-lg bg-primary-600 hover:bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={16} />
            {annSending ? 'Đang gửi…' : 'Gửi vào Hòm thư'}
          </button>
        </form>
      </section>
    </main>
    {selected && <MemberProfileCard {...selected} onClose={closeProfile} onEnter={keepProfile} onLeave={deferClose} />}
  </div>;
}
