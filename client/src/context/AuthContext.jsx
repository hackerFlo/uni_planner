import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.get('/api/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { user } = await api.post('/api/auth/login', { email, password });
    setUser(user);
    return user;
  }

  async function logout() {
    await api.post('/api/auth/logout').catch((err) => {
      console.warn('[auth] logout request failed:', err.message);
      toast?.error('Logout failed. Please try again.');
    });
    setUser(null);
  }

  async function updateAccount({ currentPassword, newEmail, newPassword }) {
    const { user: updated } = await api.patch('/api/auth/me', { currentPassword, newEmail, newPassword });
    setUser(updated);
    return updated;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
