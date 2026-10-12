import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearAccessToken, refreshSession, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    refreshSession()
      .then((session) => { if (alive) setUser(session?.user || null); })
      .finally(() => { if (alive) setIsLoading(false); });
    const onExpired = () => {
      clearAccessToken();
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener('billscope:session-expired', onExpired);
    return () => {
      alive = false;
      window.removeEventListener('billscope:session-expired', onExpired);
    };
  }, [queryClient]);

  const login = useCallback(async (credentials) => {
    const session = await api.post('/auth/login', credentials);
    setAccessToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  const register = useCallback(async (details) => {
    const session = await api.post('/auth/register', details);
    setAccessToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch { /* local logout still proceeds when the network is unavailable */ }
    clearAccessToken();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const updateUser = useCallback((nextUser) => setUser((previous) => ({ ...previous, ...nextUser })), []);
  const value = useMemo(() => ({ user, isLoading, isAuthenticated: Boolean(user), login, register, logout, updateUser }), [user, isLoading, login, register, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
