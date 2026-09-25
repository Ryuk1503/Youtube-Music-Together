import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Music, LogOut, Crown, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../api';
import MailboxModal from './MailboxModal';

export default function SiteHeader() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const [accountMenu, setAccountMenu] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/announcements')
      .then(({ data }) => {
        const list = data.announcements || [];
        if (list.length > 0) {
          const lastRead = Number(localStorage.getItem('ytm_last_read_announcement_id') || 0);
          if (Number(list[0].id) > lastRead) {
            setHasUnread(true);
          }
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const onNew = () => {
      if (!mailboxOpen) {
        setHasUnread(true);
      }
    };
    socket.on('announcement:new', onNew);
    return () => socket.off('announcement:new', onNew);
  }, [socket, mailboxOpen]);

  const handleReadLatest = (latestId) => {
    if (latestId) {
      localStorage.setItem('ytm_last_read_announcement_id', String(latestId));
      setHasUnread(false);
    }
  };

  return (
    <>
      <header className="bg-dark-800 border-b border-dark-500">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="YTM Together - Trang chủ">
            <div className="w-10 h-10 bg-primary-600/20 rounded-xl flex items-center justify-center">
              <Music className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">YTM Together</h1>
            </div>
          </Link>

          <div ref={menuRef} className="flex items-center gap-2 sm:gap-3">
            {/* Mailbox button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setMailboxOpen(true); setAccountMenu(false); }}
                className="p-2 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition relative"
                title="Hòm thư"
                aria-label="Hòm thư"
              >
                <Mail size={18} />
                {hasUnread && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse ring-2 ring-dark-800" />
                )}
              </button>
            </div>

            {/* Account greeting & menu */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={accountMenu}
                onClick={() => setAccountMenu(!accountMenu)}
                className="text-sm text-dark-100 rounded-lg p-1 hover:bg-dark-600"
              >
                Xin chào, <span className="text-white font-medium">{user?.username}</span> {user?.isAdmin && <Crown size={16} aria-label="Quản trị viên" className="inline-block align-middle text-amber-300 fill-amber-300/20" />}
              </button>
              {accountMenu && (
                <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-lg border border-dark-500 bg-dark-700 p-1 shadow-xl">
                  <button onClick={() => { setAccountMenu(false); navigate('/profile'); }} className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-dark-500">Hồ sơ</button>
                  <button onClick={() => { setAccountMenu(false); navigate('/inventory'); }} className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-dark-500">Túi đồ</button>
                  <button onClick={() => { setAccountMenu(false); navigate('/shop'); }} className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-dark-500">Shop</button>
                  {user?.isAdmin && <button onClick={() => { setAccountMenu(false); navigate('/admin'); }} className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-dark-500">Admin</button>}
                </div>
              )}
            </div>

            <button
              onClick={logout}
              className="p-2 text-dark-200 hover:text-red-400 hover:bg-dark-600 rounded-lg transition"
              title="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Large Mailbox Window Modal */}
      {mailboxOpen && (
        <MailboxModal
          isOpen={mailboxOpen}
          onClose={() => setMailboxOpen(false)}
          onReadLatest={handleReadLatest}
        />
      )}
    </>
  );
}
