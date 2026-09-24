import { Monitor, Smartphone, Sparkles, Music } from 'lucide-react';
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

        <p className="text-sm text-dark-200 leading-relaxed mb-6 font-normal">
          Để đảm bảo trải nghiệm nghe nhạc ổn định, phiên bản web hiện đã tạm ngưng hỗ trợ trên trình duyệt điện thoại.
        </p>

        <div className="w-full bg-dark-700/60 border border-dark-600 rounded-2xl p-4 text-left flex items-start gap-3.5 mb-6">
          <div className="p-2 bg-primary-600/20 rounded-xl text-primary-400 flex-shrink-0 mt-0.5">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white mb-1">Ứng dụng di động sắp ra mắt</h4>
            <p className="text-xs text-dark-300 leading-relaxed">
              Phiên bản Mobile App đang được chuẩn bị để hỗ trợ phát nhạc trong nền và tắt màn hình mượt mà!
            </p>
          </div>
        </div>

        <p className="text-xs text-dark-300">
          Vui lòng truy cập bằng <span className="text-white font-medium">máy tính (PC / Laptop)</span> để tiếp tục nghe nhạc cùng nhau.
        </p>
      </div>
    </div>
  );
}
