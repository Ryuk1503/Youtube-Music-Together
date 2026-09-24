import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AccountContext = createContext(null);
export const useAccountDialog = () => useContext(AccountContext);

export default function AccountNotice({ children }) {
  const { user, changePassword } = useAuth();
  const [mode, setMode] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const visible = mode;
  const close = () => {
    if (busy) return;
    setMode(null);
    setPassword(''); setConfirm(''); setCurrent(''); setError('');
  };
  useEffect(() => {
    if (visible && !dialog.current.open) dialog.current.showModal();
    if (!visible && dialog.current.open) dialog.current.close();
  }, [visible]);
  const save = async event => {
    event.preventDefault();
    if (password !== confirm) { setError('Hai mật khẩu mới chưa khớp.'); return; }
    setBusy(true); setError('');
    try {
      await changePassword(password, current);
      setPassword(''); setConfirm(''); setCurrent('');
      setMode('success');
    } catch (err) { setError(err.response?.data?.error || 'Không thể lưu mật khẩu. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  const inputClass = 'w-full mt-1 rounded-lg border border-dark-400 bg-dark-600 px-3 py-2 text-white';
  return <AccountContext.Provider value={() => { setError(''); setMode('password'); }}>
    {children}
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }}
      aria-labelledby="account-dialog-title"
      className={`fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-dark-500 bg-dark-700 p-6 sm:p-8 text-dark-100 shadow-2xl backdrop:bg-black/70`}>
      <button type="button" onClick={close} disabled={busy} aria-label="Đóng" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-dark-500 disabled:opacity-50"><X size={20} /></button>
      {visible === 'password' && <form onSubmit={save}>
        <h2 id="account-dialog-title" className="px-8 text-center text-xl font-bold text-white">Đổi mật khẩu</h2>
        <label className="mt-4 block text-sm">Mật khẩu hiện tại
          <input className={`${inputClass} disabled:bg-black disabled:border-dark-500 disabled:text-dark-300 disabled:cursor-not-allowed`}
            type="password" autoComplete="current-password" required={user?.hasPassword === true}
            disabled={user?.hasPassword !== true} value={current} onChange={e => setCurrent(e.target.value)}
            aria-describedby={user?.hasPassword !== true ? 'current-password-hint' : undefined} />
        </label>
        {user?.hasPassword !== true && <p id="current-password-hint" className="mt-1 text-xs text-dark-200">Tài khoản khách chưa có mật khẩu, bạn không cần nhập ô này.</p>}
        <label className="mt-4 block text-sm">Mật khẩu mới<input className={inputClass} type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="mt-4 block text-sm">Nhập lại mật khẩu mới<input className={inputClass} type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
      </form>}
      {visible === 'success' && <>
        <h2 id="account-dialog-title" className="pr-8 text-xl font-bold text-white">Đã lưu mật khẩu!</h2>
        <p className="mt-4">Các phiên đăng nhập cũ đã được thu hồi. Thiết bị này được đăng nhập lại; lần sau hãy dùng tên <strong>{user?.username}</strong> và mật khẩu mới nhé.</p>
        <button onClick={close} className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-white">Đóng</button>
      </>}
    </dialog>
  </AccountContext.Provider>;
}
