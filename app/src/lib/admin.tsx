import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const KEY = 'hala.adminToken';
type AdminState = {
  token: string | null;
  isAdmin: boolean;
  checking: boolean;
  login: (password: string) => Promise<string | null>; // zwraca błąd albo null
  logout: () => void;
};
const Ctx = createContext<AdminState>(null as never);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(KEY));
  const check = useQuery(api.auth.check, { token: token ?? undefined });
  const loginAction = useAction(api.auth.login);
  const logoutMutation = useMutation(api.auth.logout);

  // sesja wygasła albo została unieważniona
  useEffect(() => {
    if (token && check && !check.admin) { localStorage.removeItem(KEY); setToken(null); }
  }, [token, check]);

  const login = useCallback(async (password: string) => {
    const res = await loginAction({ password });
    if (!res.ok) return res.error;
    localStorage.setItem(KEY, res.token);
    setToken(res.token);
    return null;
  }, [loginAction]);

  const logout = useCallback(() => {
    if (token) logoutMutation({ token }).catch(() => {});
    localStorage.removeItem(KEY);
    setToken(null);
  }, [token, logoutMutation]);

  return (
    <Ctx.Provider value={{ token, isAdmin: !!token && !!check?.admin, checking: !!token && check === undefined, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAdmin = () => useContext(Ctx);
