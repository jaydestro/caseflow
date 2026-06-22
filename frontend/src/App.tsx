import { NavLink, Route, Routes } from 'react-router-dom';
import { TenantProvider, useTenant } from './TenantContext';
import { Dashboard } from './pages/Dashboard';
import { CaseDetail } from './pages/CaseDetail';
import { NewCase } from './pages/NewCase';
import { Diagnostics } from './pages/Diagnostics';
import { AgentWorkload } from './pages/AgentWorkload';
import { TenantLogo } from './tenantLogos';

function TenantSwitcher() {
  const { tenants, current, setCurrentId, loading } = useTenant();
  if (loading) return <span style={{ color: '#9ca3af', fontSize: 13 }}>loading…</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <TenantLogo tenantId={current?.id} size={22} alt={current?.name} />
      <select value={current?.id ?? ''} onChange={(e) => setCurrentId(e.target.value)}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </span>
  );
}

function Shell() {
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">CaseFlow</div>
        <TenantSwitcher />
      </div>
      <div className="layout">
        <nav className="sidebar">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/new" className={({ isActive }) => (isActive ? 'active' : '')}>
            New case
          </NavLink>
          <NavLink to="/diagnostics" className={({ isActive }) => (isActive ? 'active' : '')}>
            Diagnostics
          </NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/new" element={<NewCase />} />
            <Route path="/agents/:id" element={<AgentWorkload />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="*" element={<div className="empty">Not found</div>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <TenantProvider>
      <Shell />
    </TenantProvider>
  );
}
