import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
    await api.post('/api/auth/logout').catch(() => {});
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
