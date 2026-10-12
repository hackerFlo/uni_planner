import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useToast } from './ToastContext';
import { KINDS, userMessage } from '../api/errors';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userReadSequence = useRef(0);
  const toast = useToast();

  useEffect(() => {
    api.get('/api/auth/me')
      .then((data) => setUser(data?.user ?? null))
      .catch((err) => {
        setUser(null);
        // App authentication failure is the ordinary "not signed in yet" answer. Anything else is a
        // real fault, and swallowing it renders the login screen with no clue
        // that the server is rate-limiting or down.
        if (err.kind === KINDS.UNAUTHORIZED) return;
        console.warn('[auth] session check failed:', err.kind, err.message);
        // err.message already names the actual cause (see api/errors.js).
        // Access expiry is already shown centrally, including a persistent reload action.
        if (err.kind !== KINDS.ACCESS_EXPIRED) toast?.error(userMessage(err), { ref: err.requestId ?? null });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  async function login(email, password) {
    const { user } = await api.post('/api/auth/login', { email, password });
    userReadSequence.current += 1;
    setUser(user);
    return user;
  }

  async function logout() {
    userReadSequence.current += 1;
    await api.post('/api/auth/logout').catch((err) => {
      console.warn('[auth] logout request failed:', err.message);
      toast?.error('Logout failed on the server, but you have been signed out here.');
    });
    userReadSequence.current += 1;
    setUser(null);
  }

  async function updateAccount({ currentPassword, newEmail, newPassword }) {
    const { user: updated } = await api.patch('/api/auth/me', { currentPassword, newEmail, newPassword });
    userReadSequence.current += 1;
    setUser(updated);
    return updated;
  }

  const refreshUser = useCallback(async (options = {}) => {
    const sequence = ++userReadSequence.current;
    const { user: updated } = await api.get('/api/auth/me', options);
    // Earlier reads must not revert a newer zone or restore a switched account.
    setUser(current => sequence === userReadSequence.current && current?.id === updated?.id ? updated : current);
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateAccount, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
