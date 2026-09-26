import { Monitor, Smartphone, Music, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  if (window.location.search.includes('bypass_mobile=1')) return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export default function MobileBlocker() {
  return (
    <div className="min-h-screen bg-dark-900 text-dark-100 flex flex-col items-center justify-center p-5 text-center">
      <div className="max-w-md w-full bg-dark-800 border-2 border-dark-500 rounded-3xl p-7 sm:p-8 shadow-2xl flex flex-col items-center animate-fadeIn">
        <div className="relative mb-6">
          <div className="w-16 h-16 bg-primary-600/20 rounded-2xl flex items-center justify-center text-primary-400">
            <Monitor size={36} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-dark-700 border-2 border-dark-800 rounded-xl flex items-center justify-center text-dark-300">
            <Smartphone size={18} />
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-xs font-semibold text-primary-400 uppercase tracking-wider mb-4">
          <Music size={13} /> YTM Together
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-3 leading-snug">
          Hiện chỉ hỗ trợ trên máy tính
        </h1>

        <p className="text-sm text-dark-200 leading-relaxed font-normal mb-2">
          Để đảm bảo trải nghiệm nghe nhạc ổn định, phiên bản web hiện đã tạm ngưng hỗ trợ trên trình duyệt điện thoại.
        </p>

        <p className="text-sm text-dark-200 leading-relaxed font-normal mb-6">
          Thay vào đó, chúng tôi đã phát hành chính thức ứng dụng trên Android.
        </p>

        <a
          href="https://github.com/Ryuk1503/Youtube-Music-Together/raw/main/YTM-Together.apk"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold shadow-lg shadow-primary-600/25 transition transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Download size={16} /> Tải APK
        </a>
      </div>
    </div>
  );
}
