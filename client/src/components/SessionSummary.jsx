function formatTime(ms) {
  const seconds = Math.floor((ms || 0) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}
export default function SessionSummary({ summary, onClose }) {
  const time = formatTime(summary.elapsedMs);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="summary-title"
        className="w-full max-w-md rounded-2xl border border-dark-500 bg-dark-800 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h1 id="summary-title" className="text-xl font-bold text-white text-center">Tổng kết phiên nghe</h1>
        <dl className="mt-6 space-y-5">
          <div><dt className="text-sm text-dark-200">Tổng thời gian nghe</dt>
            <dd className="text-3xl text-white tabular-nums mt-1">{time}</dd></div>
          <div><dt className="text-sm text-dark-200">Nghệ sĩ được nghe nhiều nhất</dt>
            <dd className="text-lg text-white mt-1 break-words">{summary.topArtists.map(a => a.name).join(', ') || 'Chưa có dữ liệu'}</dd>
            {summary.topArtists.length > 0 && <dd className="text-sm text-dark-200 tabular-nums mt-1">{formatTime(summary.topArtists[0].elapsedMs)}{summary.topArtists.length > 1 ? ' mỗi nghệ sĩ' : ''}</dd>}</div>
          <div><dt className="text-sm text-dark-200">Thành viên thêm nhạc nhiều nhất</dt>
            <dd className="text-lg text-white mt-1 break-words">{summary.topMembers.map(m => m.name).join(', ') || 'Chưa có dữ liệu'}</dd>
            {summary.topMembers.length > 0 && <dd className="text-sm text-dark-200">{summary.topMembers[0].count} bài{summary.topMembers.length > 1 ? ' mỗi người' : ''}</dd>}</div>
        </dl>
        <button autoFocus onClick={onClose} className="w-full mt-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white">Về trang chủ</button>
      </section>
    </div>
  );
}
