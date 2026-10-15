import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import * as usersApi from "../api/users";
import { getAccessToken, setAccessToken } from "../api/client";
import type { UserMe } from "../api/types";

interface AuthContextValue {
  user: UserMe | null;
  isAuthenticated: boolean;
  /** True while the session is being restored from a stored token. */
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<UserMe>;
  logout: () => Promise<void>;
  setUser: (user: UserMe | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => getAccessToken() !== null);

  useEffect(() => {
    if (getAccessToken() === null) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    usersApi
      .getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<UserMe> => {
      const out = await authApi.login({
        username_or_email: usernameOrEmail,
        password,
      });
      setUser(out.user);
      return out.user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      setUser,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
