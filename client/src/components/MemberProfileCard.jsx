import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, X } from 'lucide-react';
import api from '../api';
import { useSocket } from '../context/SocketContext';

export default function MemberProfileCard({ roomId, profileUrl, member, anchor, modal, onClose, onEnter, onLeave }) {
  const socket = useSocket();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    const update = ({ userId, notes }) => {
      if (userId === member.userId) setProfile(current => current ? { ...current, notes } : current);
    };
    socket?.on('notes:updated', update);
    return () => socket?.off('notes:updated', update);
  }, [socket, member.userId]);
  const fetchUrl = profileUrl || `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(member.userId)}/profile`;
  useEffect(() => {
    const controller = new AbortController();
    setProfile(null); setError(''); setAvatarFailed(false);
    api.get(fetchUrl, { signal: controller.signal })
      .then(({ data }) => { if (!data.profile) throw new Error(); setProfile(data.profile); })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'Chưa tải được hồ sơ.'); });
    return () => controller.abort();
  }, [fetchUrl, retry]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    const escape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [modal, onClose]);
  const width = Math.min(340, window.innerWidth - 32);
  const left = anchor.left >= width + 16 ? anchor.left - width - 10 : Math.min(anchor.right + 10, window.innerWidth - width - 16);
  const top = Math.max(16, Math.min(anchor.top - 30, window.innerHeight - 430));
  const name = profile?.display_name || member.username;
  const content = <>
    <div className="relative h-36 bg-black">
      {profile?.cover_url && <img src={profile.cover_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
      <button onClick={onClose} aria-label="Đóng hồ sơ" className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-dark-500"><X size={18} /></button>
    </div>
    <div className="px-5 pb-6">
      <div className="relative -mt-7 flex items-end gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-primary-600 text-4xl font-medium text-white">
          {profile?.avatar_url && !avatarFailed ? <img src={profile.avatar_url} onError={() => setAvatarFailed(true)} alt={`Ảnh đại diện ${name}`} referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 pb-1"><h3 className="break-words text-lg font-bold text-white">{name} {profile?.is_admin && <Crown aria-label="Quản trị viên" size={18} className="inline-block align-middle text-amber-300 fill-amber-300/20" />}</h3>
          {profile && <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300"><span aria-hidden="true">♪</span> {new Intl.NumberFormat('vi-VN').format(BigInt(profile.notes))} Notes</div>}
        </div>
      </div>
      {error ? <div className="mt-6 text-sm text-red-300" role="alert">{error} <button onClick={() => setRetry(value => value + 1)} className="underline">Thử lại</button></div> : !profile ? <p role="status" className="mt-6 text-sm text-dark-200">Đang tải hồ sơ…</p> : <div className="mt-7"><h4 className="text-xs font-semibold uppercase tracking-widest text-dark-200">Tiểu sử</h4><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-dark-100">{profile.bio || 'Chưa có tiểu sử. Chia sẻ một chút về gu âm nhạc của bạn nhé.'}</p></div>}
    </div>
  </>;
  return createPortal(modal ? <dialog ref={dialog} aria-label={`Hồ sơ ${name}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm max-h-[85dvh] overflow-y-auto rounded-xl border border-dark-500 bg-dark-800 p-0 shadow-2xl backdrop:bg-black/65">{content}</dialog> : <div role="dialog" aria-label={`Hồ sơ ${name}`} onClick={event => event.stopPropagation()} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onLeave(); }} className="fixed z-[100] max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-xl border border-dark-500 bg-dark-800 shadow-2xl" style={{ left, top, width }}>{content}</div>, document.body);
}
