import { useState, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Sparkles, Download, X, AlertCircle } from 'lucide-react';
import api from '../api';

const AppUpdate = registerPlugin('AppUpdate');

export default function AppUpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    async function checkForUpdate() {
      try {
        const [versionRes, info] = await Promise.all([
          api.get('/app/version'),
          AppUpdate.getAppInfo().catch(() => ({ versionCode: 1, versionName: '1.0' })),
        ]);

        if (!active) return;
        const remote = versionRes.data;
        const currentCode = Number(info?.versionCode || 1);

        if (remote && remote.versionCode > currentCode) {
          setUpdateInfo({
            ...remote,
            currentVersion: info?.versionName || '1.0',
          });
        }
      } catch (_) {
        // Silent fail on background version check
      }
    }

    checkForUpdate();
    return () => { active = false; };
  }, []);

  if (!updateInfo || dismissed || !Capacitor.isNativePlatform()) {
    return null;
  }

  const handleUpdate = async () => {
    if (!updateInfo.apkUrl || downloading) return;
    setDownloading(true);
    setProgress(0);
    setError('');

    try {
      await AppUpdate.addListener('downloadProgress', (data) => {
        if (data.percent != null) {
          setProgress(data.percent);
        }
      });

      await AppUpdate.addListener('downloadError', (data) => {
        setError(data.error || 'Có lỗi xảy ra khi tải.');
        setDownloading(false);
      });

      await AppUpdate.downloadAndInstall({ url: updateInfo.apkUrl });
    } catch (err) {
      setError(err?.message || 'Không thể bắt đầu tải bản cập nhật.');
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-sm rounded-2xl border-2 border-dark-500 bg-dark-800 p-6 shadow-2xl text-dark-100">
        {!downloading && (
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-4 right-4 p-1.5 text-dark-300 hover:text-white hover:bg-dark-700 rounded-lg transition"
            aria-label="Để sau"
          >
            <X size={18} />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Đã có bản cập nhật mới!</h3>
            <p className="text-xs text-dark-300">
              v{updateInfo.versionName} (hiện tại: v{updateInfo.currentVersion})
            </p>
          </div>
        </div>

        {updateInfo.changelog && (
          <div className="mb-5 rounded-xl border border-dark-600 bg-dark-900/60 p-3.5 text-xs text-dark-200 leading-relaxed whitespace-pre-wrap">
            {updateInfo.changelog}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {downloading ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-dark-200">Đang tải bản cập nhật…</span>
              <span className="text-primary-400 font-semibold">{progress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-dark-700 overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-dark-300 text-center pt-1">
              {progress >= 100 ? 'Đang mở màn hình cài đặt…' : 'Vui lòng giữ ứng dụng mở trong lúc tải.'}
            </p>
          </div>
        ) : (
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="flex-1 py-2.5 px-3 rounded-xl border border-dark-600 bg-dark-700 hover:bg-dark-600 text-xs font-medium text-dark-200 transition"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              className="flex-1 py-2.5 px-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 shadow-lg shadow-primary-600/20"
            >
              <Download size={15} /> Cập nhật ngay
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
