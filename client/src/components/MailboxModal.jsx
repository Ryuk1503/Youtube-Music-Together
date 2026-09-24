import { useState, useEffect } from 'react';
import { Mail, X, Calendar, ArrowLeft, Trash2 } from 'lucide-react';
import api from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MailboxModal({ isOpen, onClose, onReadLatest }) {
  const socket = useSocket();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'
  const [mobileActiveId, setMobileActiveId] = useState(null);

  // Fetch announcements when opened
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    api.get('/announcements')
      .then(({ data }) => {
        let list = data.announcements || [];
        if (!user?.isAdmin) {
          try {
            const dismissed = JSON.parse(localStorage.getItem('ytm_dismissed_announcements') || '[]');
            list = list.filter(a => !dismissed.includes(a.id));
          } catch (e) {}
        }
        setAnnouncements(list);
        if (list.length > 0) {
          setSelectedId(prev => (list.some(a => a.id === prev) ? prev : list[0].id));
          onReadLatest?.(list[0].id);
        }
      })
      .catch(() => {
        setError('Chưa tải được danh sách thư.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, onReadLatest, user?.isAdmin]);

  // Listen for real-time announcements
  useEffect(() => {
    if (!socket) return;
    const onNew = (announcement) => {
      setAnnouncements(prev => [announcement, ...prev]);
      if (isOpen) {
        onReadLatest?.(announcement.id);
      }
    };
    const onDeleted = ({ id }) => {
      setAnnouncements(prev => prev.filter(a => String(a.id) !== String(id)));
      setSelectedId(prev => String(prev) === String(id) ? null : prev);
    };
    socket.on('announcement:new', onNew);
    socket.on('announcement:deleted', onDeleted);
    return () => {
      socket.off('announcement:new', onNew);
      socket.off('announcement:deleted', onDeleted);
    };
  }, [socket, isOpen, onReadLatest]);

  const handleDeleteAnnouncement = async (id) => {
    if (!user?.isAdmin) {
      if (!window.confirm('Bạn có muốn xóa thư này khỏi hòm thư của bạn?')) return;
      try {
        const dismissed = JSON.parse(localStorage.getItem('ytm_dismissed_announcements') || '[]');
        if (!dismissed.includes(id)) {
          dismissed.push(id);
          localStorage.setItem('ytm_dismissed_announcements', JSON.stringify(dismissed));
        }
        setAnnouncements(prev => prev.filter(a => a.id !== id));
        if (selectedId === id) setSelectedId(null);
      } catch (e) {}
      return;
    }

    if (!window.confirm('Bạn có chắc chắn muốn xóa thư này khỏi hệ thống?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể xóa thư.');
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selected = announcements.find(a => a.id === selectedId) || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl h-[560px] sm:h-[620px] bg-dark-800 border-2 border-dark-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Top Header: HÒM THƯ */}
        <div className="relative border-b-2 border-dark-500 px-6 py-4 flex items-center justify-center flex-shrink-0 bg-dark-850">
          <h2 className="text-xl font-bold tracking-widest text-white uppercase">
            HÒM THƯ
          </h2>
          <button
            onClick={onClose}
            className="absolute right-4 p-2 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
            aria-label="Đóng hòm thư"
            title="Đóng (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Left Column: Danh sách thư theo từng dòng */}
          <div className={`w-full md:w-80 border-r-2 border-dark-500 flex flex-col bg-dark-850/50 flex-shrink-0 ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between text-xs text-dark-300 font-medium">
              <span>Tất cả ({announcements.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-dark-600/60">
              {loading && announcements.length === 0 && (
                <div className="p-6 text-center text-dark-300 text-sm">Đang tải thư…</div>
              )}
              {error && announcements.length === 0 && (
                <div className="p-6 text-center text-red-400 text-sm">{error}</div>
              )}
              {!loading && !error && announcements.length === 0 && (
                <div className="p-8 text-center text-dark-300 text-sm">Hòm thư trống</div>
              )}

              {announcements.map((item) => {
                const isActive = item.id === selectedId;
                const isHoverOrMobileActive = mobileActiveId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`relative group w-full transition flex items-center overflow-hidden cursor-pointer ${
                      isActive
                        ? 'bg-primary-600/20 border-l-4 border-primary-500 text-white'
                        : 'text-dark-200 hover:bg-dark-700/60 hover:text-white'
                    }`}
                    onClick={() => {
                      setMobileActiveId(prev => prev === item.id ? null : item.id);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setMobileView('detail');
                      }}
                      className="w-full text-left px-4 py-3.5 flex flex-col gap-1 min-w-0"
                    >
                      <span className={`text-sm font-medium truncate block w-full ${isActive ? 'text-white font-semibold' : ''}`}>
                        {item.title}
                      </span>
                      <span className="text-[11px] text-dark-300">
                        {formatTime(item.created_at)}
                      </span>
                    </button>

                    {/* Thanh Xóa khi hover (desktop) hoặc nhấn 1 lần (điện thoại) */}
                    <div
                      className={`absolute right-0 top-0 bottom-0 flex items-center pr-3 pl-8 transition-opacity duration-200 ${
                        isActive
                          ? 'bg-gradient-to-l from-[#1e2338] via-[#1e2338]/95 to-transparent'
                          : 'bg-gradient-to-l from-dark-850 via-dark-850/95 group-hover:from-dark-700 group-hover:via-dark-700/95 to-transparent'
                      } ${
                        isHoverOrMobileActive
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnouncement(item.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded-lg transition"
                        title="Xóa thư"
                        aria-label="Xóa thư"
                      >
                        <Trash2 size={14} />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Tựa đề, nội dung thư và Kí tên */}
          <div className={`flex-1 flex flex-col min-h-0 bg-dark-800 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>

            {selected ? (
              <>
                {/* Header + nội dung cuộn */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-h-0">
                  {/* Mobile back button */}
                  <div className="md:hidden mb-4">
                    <button
                      onClick={() => setMobileView('list')}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                    >
                      <ArrowLeft size={16} /> Quay lại danh sách thư
                    </button>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 leading-snug">
                    {selected.title}
                  </h3>
                  <p className="text-xs text-dark-300 pb-4 mb-6 border-b border-dark-600 flex items-center gap-1.5">
                    <Calendar size={14} className="text-dark-300" />
                    {formatTime(selected.created_at)}
                  </p>

                  <div className="text-sm sm:text-base text-dark-100 whitespace-pre-wrap leading-relaxed font-normal">
                    {selected.content}
                  </div>
                </div>

                {/* Kí tên — cố định ở cuối, ngoài vùng cuộn */}
                <div className="flex-shrink-0 px-6 sm:px-8 py-4 border-t border-dark-600/60 flex justify-end bg-dark-800">
                  <div className="text-right">
                    <p className="text-sm sm:text-base text-dark-300 font-normal">Ký tên</p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-primary-400 tracking-wide mt-1">
                      {selected.sender || 'RYUK'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-dark-300 text-sm p-6">
                {/* Mobile back button khi không có thư nào được chọn */}
                <div className="md:hidden mb-4 self-start">
                  <button
                    onClick={() => setMobileView('list')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300"
                  >
                    <ArrowLeft size={16} /> Quay lại danh sách thư
                  </button>
                </div>
                <Mail size={44} className="mb-3 opacity-30" />
                <span>Chọn một thư ở danh sách bên trái để đọc nội dung</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
