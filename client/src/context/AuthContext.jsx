import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Verify the guest token is still valid.
      api
        .get('/guest/me')
        .then((res) => {
          setUser(res.data.guest);
          localStorage.setItem('user', JSON.stringify(res.data.guest));
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const createGuest = async (displayName) => {
    const res = await api.post('/guest', { displayName });
    const { guest, token } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(guest));
    setUser(guest);
    return guest;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, createGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
