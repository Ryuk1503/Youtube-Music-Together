import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

if (Capacitor.isNativePlatform()) {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);

    const startSilentAudio = () => {
      try {
        const audio = document.createElement('audio');
        audio.loop = true;
        audio.volume = 0.001;
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audio.play().catch(() => {});
      } catch (_) {}
    };
    window.addEventListener('click', startSilentAudio, { once: true });
    window.addEventListener('touchstart', startSilentAudio, { once: true });
  } catch (e) {
    console.warn('Visibility override error:', e);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
