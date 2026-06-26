import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  expiresAt: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => { setUser(data.user); setExpiresAt(data.expiresAt ?? null); })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    setExpiresAt(data.expiresAt ?? null);
  };

  const verifyOtp = async (email: string, otp: string) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    setUser(data.user);
    setExpiresAt(data.expiresAt ?? null);
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    setExpiresAt(null);
  };

  const refreshSession = async () => {
    const { data } = await api.post('/auth/refresh');
    setExpiresAt(data.expiresAt ?? null);
  };

  return (
    <AuthContext.Provider value={{ user, expiresAt, login, verifyOtp, logout, refreshSession, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
