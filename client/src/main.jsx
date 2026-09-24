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
