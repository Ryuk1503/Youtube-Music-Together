import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export default function ListeningTimer({ snapshot, connected }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    setNow(performance.now());
    if (!snapshot?.running || !connected) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot, connected]);
  const elapsed = (snapshot?.elapsedMs || 0) + (snapshot?.running
    ? Math.max(0, now - snapshot.receivedAt) : 0);
  const seconds = Math.floor(elapsed / 1000);
  const display = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return (
    <div title="Tổng thời gian phòng đã nghe nhạc" aria-label={`Tổng thời gian phòng đã nghe nhạc: ${display}`}
      className="flex items-center gap-1.5 text-dark-200 text-xs sm:text-sm whitespace-nowrap">
      <Clock size={16} aria-hidden="true" />
      <span className="tabular-nums">{display}</span>
    </div>
  );
}
