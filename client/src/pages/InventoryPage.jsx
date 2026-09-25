import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import SiteHeader from '../components/SiteHeader';
import ItemBrowser from '../components/ItemBrowser';
import { useShopData, useShopAction } from '../hooks/useShop';

export default function InventoryPage() {
  const { updateUser } = useAuth();
  const { data, error, reload } = useShopData('/shop/inventory');
  const action = useShopAction();
  const dialog = useRef(null);
  const [newId, setNewId] = useState('');
  const [message, setMessage] = useState('');
  async function useCard(event) {
    event.preventDefault();
    const result = await action.perform('/shop/use', { itemId: 'id-change-card', newId });
    if (result) {
      updateUser(current => ({ ...current, publicId: result.publicId }));
      dialog.current.close(); setMessage(`Đã đổi ID thành ${result.publicId}.`); reload();
    }
  }
  return <div className="min-h-screen bg-dark-900 text-dark-100">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Túi đồ</h2>
      </div>
      {message && <p role="status" className="mt-5 text-sm text-green-400">{message}</p>}
      {error && <p role="alert" className="mt-5 text-sm text-red-400">{error} <button onClick={reload} className="underline">Thử lại</button></p>}
      {!data && !error && <p className="mt-8 text-sm text-dark-200">Đang tải túi đồ…</p>}
      {data && <ItemBrowser items={data.items} inventory busy={action.busy} onAction={() => { setNewId(''); action.clearError(); dialog.current.showModal(); }} />}
    </main>
    <dialog ref={dialog} onCancel={event => { if (action.busy) event.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-dark-500 bg-dark-800 p-6 text-dark-100 backdrop:bg-black/70">
      <form onSubmit={useCard}>
        <h3 className="text-center text-lg font-semibold text-white">Đổi ID</h3>
        <p className="mt-3 break-all text-sm text-dark-200">ID hiện tại: {data?.publicId}</p>
        <label className="mt-4 block text-sm" htmlFor="new-public-id">ID mới</label>
        <input id="new-public-id" value={newId} onChange={event => setNewId(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} disabled={action.busy}
          className="mt-2 w-full rounded-lg border border-dark-500 bg-dark-900 px-3 py-2 text-white outline-none focus:border-primary-400" />
        <p className="mt-2 text-xs leading-relaxed text-dark-200">3–24 ký tự: chữ không dấu, số, dấu - hoặc _. Đổi thành công sẽ dùng 1 thẻ. Tên đăng nhập giữ nguyên.</p>
        {action.error && <p role="alert" className="mt-3 text-sm text-red-400">{action.error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={action.busy} onClick={() => dialog.current.close()} className="rounded-lg bg-dark-600 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
          <button disabled={action.busy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">{action.busy ? 'Đang đổi…' : 'Đổi ID'}</button>
        </div>
      </form>
    </dialog>
  </div>;
}
