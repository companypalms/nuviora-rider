import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, setUnauthorizedHandler } from './api';
import { deleteItem, getItem, SESSION_KEY as KEY, setItem } from './storage';

type SessionUser = { id: number; names: string; surnames: string | null };
type Session = {
  ready: boolean;
  token: string | null;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const clear = useCallback(async () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    await deleteItem(KEY);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { token: string; user: SessionUser };
          setToken(saved.token);
          setTokenState(saved.token);
          setUser(saved.user);
        } catch {
          void deleteItem(KEY);
        }
      }
      setReady(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: { id: number; names: string; surnames: string | null; token: string; role?: { description?: string } } }>('/login', {
      body: { email: email.trim(), password },
    });
    // Esta app es solo para los riders propios (rol Repartidor)
    if (res.user.role?.description !== 'Repartidor') {
      throw new Error('Esta app es solo para riders. Entra con tu usuario de rider.');
    }
    const next = { token: res.user.token, user: { id: res.user.id, names: res.user.names, surnames: res.user.surnames } };
    setToken(next.token);
    setTokenState(next.token);
    setUser(next.user);
    await setItem(KEY, JSON.stringify(next));
  }, []);

  const value = useMemo(() => ({ ready, token, user, signIn, signOut: clear }), [ready, token, user, signIn, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession fuera de SessionProvider');
  }
  return value;
}
