import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';

async function prepareImage(file, cover) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh JPG, PNG hoặc WebP nhé.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh cần nhỏ hơn 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, (cover ? 1200 : 512) / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45, 0.25]) {
      const result = canvas.toDataURL('image/webp', quality);
      if (result.startsWith('data:image/webp;') && result.length <= 90000) return result;
    }
    throw new Error('Ảnh có quá nhiều chi tiết. Hãy chọn ảnh nhỏ hơn.');
  } finally { bitmap.close(); }
}

export default function ProfileImagePicker({ label, value, cover, disabled, onSave, onError }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function select(file) {
    if (!file || disabled || busy) return;
    setBusy(true);
    try { const image = await prepareImage(file, cover); await onSave(image); setFailed(false); }
    catch (error) { onError(error.message || 'Không thể tải ảnh lên.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className="min-w-0">
    <h3 className="mb-2 text-sm font-medium text-dark-200">{label}</h3>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label={`Chọn ${label.toLowerCase()}`} onChange={event => select(event.target.files?.[0])} />
    <button type="button" disabled={disabled || busy} onClick={() => input.current.click()}
      onDragOver={event => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files?.[0]); }}
      className={`relative flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border bg-black transition disabled:opacity-50 ${dragging ? 'border-primary-400 ring-2 ring-primary-400' : 'border-dark-500 hover:border-primary-400'}`}>
      {value && !failed && <img src={value} onError={() => setFailed(true)} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
      <span className="relative flex flex-col items-center gap-2 px-2 text-xs text-white"><ImagePlus size={22} />{busy ? 'Đang lưu ảnh…' : 'Chọn ảnh hoặc kéo thả'}</span>
    </button>
    {value && <button disabled={disabled || busy} onClick={async () => { setBusy(true); try { await onSave(''); } catch (error) { onError(error.message); } finally { setBusy(false); } }} className="mt-2 text-xs text-dark-200 hover:text-white">Xóa ảnh</button>}
  </div>;
}
