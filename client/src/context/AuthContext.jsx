import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from './ToastContext';
import { KINDS, userMessage } from '../api/errors';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.get('/api/auth/me')
      .then((data) => setUser(data?.user ?? null))
      .catch((err) => {
        setUser(null);
        // 401 is the ordinary "not signed in yet" answer. Anything else is a
        // real fault, and swallowing it renders the login screen with no clue
        // that the server is rate-limiting or down.
        if (err.kind === KINDS.UNAUTHORIZED || err.status === 401) return;
        console.warn('[auth] session check failed:', err.kind, err.message);
        // err.message already names the actual cause (see api/errors.js).
        toast?.error(userMessage(err), { ref: err.requestId ?? null });
      })
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
      toast?.error('Logout failed on the server, but you have been signed out here.');
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
