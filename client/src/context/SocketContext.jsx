import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // In production, connect to same host; in dev, connect to localhost:3001
    const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
    const newSocket = io(socketUrl, {
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      if (err.message === 'Authentication required') window.dispatchEvent(new Event('session-expired'));
    });
    const renewed = () => newSocket.connect();
    newSocket.on('account:idUpdated', ({ publicId }) => updateUser(current => current ? { ...current, publicId } : current));
    window.addEventListener('session-renewed', renewed);

    setSocket(newSocket);

    return () => {
      window.removeEventListener('session-renewed', renewed);
      newSocket.disconnect();
    };
  }, [user?.id]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
