import { useEffect, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import { Crown, UserRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountDialog } from '../components/AccountNotice';
import api from '../api';
import ProfileImagePicker from '../components/ProfileImagePicker';
import { useSocket } from '../context/SocketContext';

const fields = [
  { key: 'display_name', label: 'Tên hồ sơ', max: 30 },
  { key: 'bio', label: 'Tiểu sử', max: 500 },
];

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const socket = useSocket();
  const openPassword = useAccountDialog();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/guest/profile');
      if (!data.profile) throw new Error('Profile unavailable');
      setProfile(data.profile);
    }
    catch { setError('Chưa tải được hồ sơ. Vui lòng thử lại sau ít giây.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [user.id, user.publicId]);
  useEffect(() => {
    const update = ({ userId, notes }) => {
      if (userId === user.id) setProfile(current => current ? { ...current, notes } : current);
    };
    socket?.on('notes:updated', update);
    return () => socket?.off('notes:updated', update);
  }, [socket, user.id]);
  useEffect(() => { setImageFailed(false); }, [profile?.avatar_url]);

  async function save(event, field) {
    event.preventDefault(); setSaving(true); setError(''); setSaved('');
    try {
      const { data } = await api.patch('/guest/profile', { field, value: draft });
      if (data.guest) updateUser(data.guest);
      setProfile(data.profile); setEditing(null); setSaved('Đã lưu thông tin hồ sơ.');
    } catch (err) { setError(err.response?.data?.error || 'Không thể lưu. Vui lòng thử lại.'); }
    finally { setSaving(false); }
  }
  const name = profile?.display_name || user.username;
  async function saveImage(field, value) {
    setSaving(true); setError(''); setSaved('');
    try {
      const { data } = await api.patch('/guest/profile', { field, value });
      if (!data.profile) throw new Error('Chưa thể lưu ảnh. Vui lòng thử lại sau.');
      setProfile(data.profile); setSaved('Đã lưu ảnh hồ sơ.');
    } catch (err) { throw new Error(err.response?.data?.error || err.message || 'Không thể lưu ảnh.'); }
    finally { setSaving(false); }
  }
  const inputClass = 'w-full rounded-xl border border-dark-400 bg-dark-900 px-4 py-3 text-white outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400';

  return <div className="min-h-screen bg-dark-900 text-dark-100">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-dark-500 bg-dark-800">
          <div className="relative h-36 overflow-hidden bg-black" aria-hidden="true">
            {profile?.cover_url && <img src={profile.cover_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
          </div>
          <div className="px-6 pb-7">
            <div className="relative -mt-7 flex items-end gap-4">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-[5px] border-dark-800 bg-primary-600 text-4xl font-semibold text-white">
                {profile?.avatar_url && !imageFailed ? <img src={profile.avatar_url} onError={() => setImageFailed(true)} referrerPolicy="no-referrer" alt={`Ảnh đại diện của ${name}`} className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 pb-1"><h2 className="break-words text-xl font-bold text-white">{name} {(profile?.is_admin || user.isAdmin) && <Crown size={19} aria-label="Quản trị viên" className="inline-block align-middle text-amber-300 fill-amber-300/20" />}</h2>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300"><span aria-hidden="true">♪</span> {profile ? new Intl.NumberFormat('vi-VN').format(BigInt(profile.notes)) : '—'} Notes</div>
              </div>
            </div>
            <div className="mt-8"><h3 className="text-xs font-semibold uppercase tracking-widest text-dark-200">Tiểu sử</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{profile?.bio || 'Chưa có tiểu sử. Chia sẻ một chút về gu âm nhạc của bạn nhé.'}</p></div>
          </div>
        </aside>
        <section className="rounded-xl border border-dark-500 bg-dark-800 p-5 sm:p-7" aria-labelledby="profile-details-title">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-primary-600/15 p-2.5 text-primary-400"><UserRound size={21} /></div><div><h2 id="profile-details-title" className="text-lg font-semibold text-white">Thông tin cá nhân</h2><p className="mt-1 break-all text-sm text-dark-200">ID: <span className="text-dark-100">{profile?.public_id || user.publicId || '—'}</span></p></div></div>
          {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{error} {!profile && <button onClick={load} disabled={loading} className="ml-2 underline">Thử lại</button>}</div>}
          {saved && <p role="status" className="mt-5 text-sm text-emerald-400">{saved}</p>}
          {loading ? <p className="py-10 text-center text-sm text-dark-200" role="status">Đang tải hồ sơ…</p> : <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ProfileImagePicker label="Ảnh nền" cover value={profile?.cover_url} disabled={!profile || saving} onSave={value => saveImage('cover_url', value)} onError={setError} />
              <ProfileImagePicker label="Ảnh đại diện" value={profile?.avatar_url} disabled={!profile || saving} onSave={value => saveImage('avatar_url', value)} onError={setError} />
            </div>
            <p className="text-xs text-dark-200">JPG, PNG hoặc WebP, tối đa 10 MB. Ảnh được thu nhỏ trước khi lưu.</p>
            {fields.map(field => <div key={field.key}>
              <h3 className="mb-2 text-sm font-medium text-dark-200">{field.label}</h3>
              <div className="rounded-xl border border-dark-500 bg-dark-900/40 px-4 py-2">
              <div className="flex items-center justify-between gap-4"><div className="min-w-0 flex-1">
                {editing !== field.key && <p className="whitespace-pre-wrap break-words text-sm text-white">{profile ? (field.key === 'avatar_url' ? (profile.avatar_url ? 'Đã đặt ảnh đại diện' : 'Ảnh mặc định') : profile[field.key] || 'Chưa thêm') : 'Chưa tải được'}</p>}
              </div><button type="button" disabled={!profile || saving} onClick={() => { setEditing(field.key); setDraft(profile[field.key]); setError(''); setSaved(''); }} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-primary-400 hover:bg-primary-600/10 disabled:opacity-40">Sửa</button></div>
              {editing === field.key && <form onSubmit={event => save(event, field.key)} className="mt-3">
                {field.key === 'bio' ? <textarea aria-label={field.label} autoFocus rows={4} maxLength={field.max} className={inputClass} value={draft} onChange={e => setDraft(e.target.value)} /> : <input aria-label={field.label} autoFocus type={field.key === 'avatar_url' ? 'url' : 'text'} required={field.key === 'display_name'} maxLength={field.max} className={inputClass} value={draft} onChange={e => setDraft(e.target.value)} />}
                <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-lg bg-dark-500 px-4 py-2 text-sm">Hủy</button><button disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu'}</button></div>
              </form>}
              </div>
            </div>)}
            <div><h3 className="mb-2 text-sm font-medium text-dark-200">Mật khẩu</h3>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-dark-500 bg-dark-900/40 px-4 py-2"><p className="flex items-center gap-2 text-sm text-white">{user.hasPassword ? <><ShieldCheck size={16} className="text-emerald-400" /><span aria-label="Đã đặt mật khẩu">••••••••</span></> : 'Chưa đặt mật khẩu'}</p><button onClick={openPassword} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-primary-400 hover:bg-primary-600/10">Sửa</button></div>
            </div>
          </div>}
        </section>
      </div>
    </main>
  </div>;
}
