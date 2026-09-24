import { useState } from 'react';
import IdCardArtwork from './IdCardArtwork';

export default function ItemBrowser({ items, inventory = false, onAction, busy = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = items.find(item => item.id === selectedId) || items[0];
  return <div className="mt-6 grid overflow-hidden rounded-xl border border-dark-500 bg-dark-800 md:min-h-[480px] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <section aria-label="Danh sách vật phẩm" className="min-w-0 p-3 sm:p-4">
      <div className="flex flex-wrap content-start gap-2">
        {items.map(item => <button key={item.id} type="button" title={item.name} aria-label={`Chọn ${item.name}`} aria-pressed={selected?.id === item.id}
          onClick={() => setSelectedId(item.id)} className={`relative flex h-16 w-16 items-center justify-center rounded-lg border transition sm:h-[72px] sm:w-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${selected?.id === item.id ? 'border-primary-400 bg-primary-600/15' : 'border-dark-500 bg-dark-900/60 hover:border-dark-300'}`}>
          <IdCardArtwork className="h-14 w-14" />
          {inventory && <span className="absolute bottom-0.5 right-1 rounded bg-dark-900/90 px-1 text-xs text-white">×{item.quantity}</span>}
        </button>)}
      </div>
      {!items.length && <p className="py-10 text-center text-sm text-dark-200">{inventory ? 'Túi đồ đang trống.' : 'Chưa có vật phẩm.'}</p>}
    </section>
    <section aria-label="Chi tiết vật phẩm" className="flex min-w-0 flex-col border-t border-dark-500 p-5 sm:p-6 md:border-l md:border-t-0">
      {selected ? <>
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dark-500 bg-dark-900/60">
          <IdCardArtwork className="h-40 w-40 max-w-[70%]" />
        </div>
        <div className="py-6">
          <h3 className="text-lg font-semibold text-white">{selected.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-dark-200">{selected.description}</p>
          {inventory && <p className="mt-4 text-sm font-semibold text-dark-100">Đang có: {selected.quantity}</p>}
        </div>
        <button type="button" disabled={busy} onClick={() => onAction(selected)} className="mt-auto w-full rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50">
          {inventory ? 'Sử dụng' : `♪ ${selected.price} Notes`}
        </button>
      </> : <div className="flex min-h-48 flex-1 items-center justify-center text-sm text-dark-200">Chọn vật phẩm để xem chi tiết.</div>}
    </section>
  </div>;
}
