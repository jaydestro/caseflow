import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api } from './api';
import { Tenant } from './types';

interface TenantContextValue {
  tenants: Tenant[];
  current: Tenant | null;
  setCurrentId: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const STORAGE_KEY = 'caseflow.tenantId';

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listTenants()
      .then((ts) => {
        if (cancelled) return;
        setTenants(ts);
        if (!currentId && ts.length > 0) {
          setCurrentIdState(ts[0].id);
          localStorage.setItem(STORAGE_KEY, ts[0].id);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCurrentId = (id: string) => {
    setCurrentIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const current = tenants.find((t) => t.id === currentId) ?? null;

  return (
    <TenantContext.Provider value={{ tenants, current, setCurrentId, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const v = useContext(TenantContext);
  if (!v) throw new Error('useTenant must be used inside TenantProvider');
  return v;
}
