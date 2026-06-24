import {
  ReactNode,
  createContext,
  useContext,
  useState,
} from 'react';

// Demo-only credentials. This is a fake, client-side gate for the sample app —
// it is NOT real authentication and must not be reused in production.
export const DEMO_USERNAME = 'admin';
export const DEMO_PASSWORD = 'admin';

const AUTH_KEY = 'caseflow.authed';
const USER_KEY = 'caseflow.user';

interface AuthContextValue {
  authed: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (e.g. privacy mode) — non-fatal for demo auth
  }
}

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // non-fatal
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => safeGetItem(USER_KEY));
  const [authed, setAuthed] = useState<boolean>(
    () => safeGetItem(AUTH_KEY) === 'true' && safeGetItem(USER_KEY) !== null,
  );

  const login = (user: string, password: string) => {
    if (user === DEMO_USERNAME && password === DEMO_PASSWORD) {
      safeSetItem(AUTH_KEY, 'true');
      safeSetItem(USER_KEY, user);
      setAuthed(true);
      setUsername(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    safeRemoveItem(AUTH_KEY);
    safeRemoveItem(USER_KEY);
    setAuthed(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ authed, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
