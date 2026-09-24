import { useState, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, matchPath } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import GuestPage from './pages/GuestPage';
import RoomListPage from './pages/RoomListPage';
import RoomPage from './pages/RoomPage';
import AccountNotice from './components/AccountNotice';
import ProfilePage from './pages/ProfilePage';
import ShopPage from './pages/ShopPage';
import InventoryPage from './pages/InventoryPage';
import AdminPage from './pages/AdminPage';
import MobileBlocker, { isMobileDevice } from './components/MobileBlocker';

export function ListeningRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const isRoom = !!matchPath('/room/:roomId', location.pathname);
  const [roomLocation, setRoomLocation] = useState(() => isRoom ? location : null);
  const [previousLocation, setPreviousLocation] = useState(location);
  // Keep the same RoomPage mounted while the home route is visible.
  // Only navigation can activate a room. Clearing it on exit must not restore
  // the old room while the router's transition to home is still pending.
  if (previousLocation !== location) {
    setPreviousLocation(location);
    if (isRoom) setRoomLocation(location);
  }
  const exitRoom = useCallback((error) => {
    setRoomLocation(null);
    navigateRef.current('/', { replace: true, state: error ? { error } : null });
  }, []);
  return <>
    <div className={roomLocation && !isRoom ? 'pb-24' : ''}>
      <Routes>
        <Route path="/" element={<RoomListPage activeRoomLocation={roomLocation} />} />
        <Route path="/room/:roomId" element={null} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
    {roomLocation && <Routes location={roomLocation}>
      <Route path="/room/:roomId" element={<RoomPage key={roomLocation.pathname} minimized={!isRoom} onExit={exitRoom} />} />
    </Routes>}
  </>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (isMobileDevice()) {
    return <MobileBlocker />;
  }

  // Wrap all protected routes in a single SocketProvider so the socket
  // persists across page navigations (RoomList → Room, etc.)
  if (!loading && user) {
    return (
      <SocketProvider>
        <AccountNotice><ListeningRoutes /></AccountNotice>
      </SocketProvider>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<GuestPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route
        path="*"
        element={
          loading ? (
            <div className="min-h-screen flex items-center justify-center bg-dark-900">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Navigate to="/" />
          )
        }
      />
    </Routes>
  );
}
