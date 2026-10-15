import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  type LoginPayload,
} from "../api/auth";
import { setSessionExpiredHandler } from "../api/client";
import type { UserMe } from "../api/types";

interface AuthContextValue {
  user: UserMe | null;
  loading: boolean;
  signIn: (payload: LoginPayload) => Promise<UserMe>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await getMe();
        if (active) {
          setUser(me);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const result = await loginRequest(payload);
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
