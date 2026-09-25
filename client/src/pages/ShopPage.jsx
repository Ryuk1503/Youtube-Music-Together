import { useRef, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import ItemBrowser from '../components/ItemBrowser';
import { useShopData, useShopAction } from '../hooks/useShop';

export default function ShopPage() {
  const { data, error, reload } = useShopData('/shop');
  const action = useShopAction();
  const dialog = useRef(null);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const count = Number(quantity);
  const validCount = Number.isSafeInteger(count) && count > 0 && count <= 2147483647;
  const total = selected && validCount ? new Intl.NumberFormat('vi-VN').format(BigInt(selected.price) * BigInt(count)) : '—';
  const [message, setMessage] = useState('');
  async function buy() {
    if (!validCount) return;
    const result = await action.perform('/shop/buy', { itemId: selected.id, quantity: count });
    if (result) { dialog.current.close(); setMessage(`Đã mua ${result.purchased ?? 1} ${selected.name}. Bạn có thể dùng thẻ trong Túi đồ.`); reload(); }
  }
  return <div className="min-h-screen bg-dark-900 text-dark-100">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-white">Shop</h2>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-300">♪ {data ? new Intl.NumberFormat('vi-VN').format(BigInt(data.notes)) : '—'} Notes</span>
        </div>
      </div>
      {message && <p role="status" className="mt-5 text-sm text-green-400">{message}</p>}
      {error && <p role="alert" className="mt-5 text-sm text-red-400">{error} <button onClick={reload} className="underline">Thử lại</button></p>}
      {!data && !error && <p className="mt-8 text-sm text-dark-200">Đang tải cửa hàng…</p>}
      {data && <ItemBrowser items={data.items} busy={action.busy} onAction={item => { setSelected(item); setQuantity('1'); action.clearError(); dialog.current.showModal(); }} />}
    </main>
    <dialog ref={dialog} onCancel={event => { if (action.busy) event.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-dark-500 bg-dark-800 p-6 text-dark-100 backdrop:bg-black/70">
      <h3 className="text-lg font-semibold text-white">Mua {selected?.name}</h3>
      <p className="mt-3 text-sm">Đơn giá: <span className="text-amber-300">{selected?.price} Notes</span></p>
      <label htmlFor="purchase-quantity" className="mt-4 block text-sm">Số lượng</label>
      <input id="purchase-quantity" type="number" inputMode="numeric" min="1" step="1" value={quantity} disabled={action.busy} onChange={event => setQuantity(event.target.value)} className="mt-2 w-full rounded-lg border border-dark-500 bg-dark-900 px-3 py-2 text-white outline-none focus:border-primary-400" />
      <p className="mt-3 text-sm">Tổng: <span className="font-semibold text-amber-300">{total} Notes</span></p>
      {action.error && <p role="alert" className="mt-3 text-sm text-red-400">{action.error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button disabled={action.busy} onClick={() => dialog.current.close()} className="rounded-lg bg-dark-600 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
        <button disabled={action.busy || !validCount} onClick={buy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50">{action.busy ? 'Đang mua…' : 'Xác nhận mua'}</button>
      </div>
    </dialog>
  </div>;
}
