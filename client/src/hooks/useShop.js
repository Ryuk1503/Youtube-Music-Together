import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';
import { useSocket } from '../context/SocketContext';

export function useShopData(path) {
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.get(path, { signal: controller.signal }).then(({ data }) => setData(data))
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || 'Chưa tải được dữ liệu. Hãy thử lại.'); });
    return () => controller.abort();
  }, [path, version]);
  useEffect(() => {
    socket?.on('inventory:updated', reload);
    socket?.on('notes:updated', reload);
    socket?.on('connect', reload);
    return () => {
      socket?.off('inventory:updated', reload);
      socket?.off('notes:updated', reload);
      socket?.off('connect', reload);
    };
  }, [socket, reload]);
  return { data, error, reload };
}

export function useShopAction() {
  const pending = useRef(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function perform(path, payload) {
    if (running.current) return null;
    running.current = true; setBusy(true); setError('');
    const key = JSON.stringify({ path, payload });
    // Reuse after network failure so retry cannot charge twice.
    if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() };
    try {
      const { data } = await api.post(path, { ...payload, requestId: pending.current.requestId });
      pending.current = null;
      return data;
    } catch (err) {
      if (err.response?.status >= 400 && err.response.status < 500) pending.current = null;
      setError(err.response?.data?.error || 'Chưa nhận được kết quả. Bấm lại để kiểm tra giao dịch.');
      return null;
    } finally { running.current = false; setBusy(false); }
  }
  return { perform, busy, error, clearError: () => setError('') };
}
