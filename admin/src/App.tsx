import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { Users, Bot, Activity, LogOut, ScrollText, KeyRound, Menu, ChevronRight } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import AgentsPage from './pages/AgentsPage';
import UsersPage from './pages/UsersPage';
import DashboardPage from './pages/DashboardPage';
import LogsPage from './pages/LogsPage';
import ApiTokensPage from './pages/ApiTokensPage';

function getUser() {
  try { return JSON.parse(localStorage.getItem('admin_user') || 'null'); } catch { return null; }
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = getUser();
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// Admin specific SVG Icons (Matching frontend minimal style but using purple instead of blue/green)
function IconDashboard({ active }: { active: boolean }) {
  const c = active ? '#8b5cf6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill={c} opacity={active ? 1 : 0.5} />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill={c} opacity={active ? 0.6 : 0.3} />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill={c} opacity={active ? 0.6 : 0.3} />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill={c} opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function IconAgents({ active }: { active: boolean }) {
  const c = active ? '#8b5cf6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3.5" width="11" height="7" rx="1.5" stroke={c} strokeWidth="1.3" opacity={active ? 0.6 : 0.35} />
      <rect x="4.5" y="5.5" width="3" height="3" rx="0.8" fill={c} opacity={active ? 0.8 : 0.45} />
      <rect x="9" y="6" width="2.5" height="1" rx="0.5" fill={c} opacity={active ? 0.5 : 0.3} />
      <rect x="9" y="8" width="1.5" height="1" rx="0.5" fill={c} opacity={active ? 0.4 : 0.25} />
      <path d="M5.5 10.5v2M8 10.5v2M10.5 10.5v2" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={active ? 0.5 : 0.3} />
      <path d="M4 12.5h8" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={active ? 0.4 : 0.25} />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  const c = active ? '#8b5cf6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.5" fill={c} opacity={active ? 0.8 : 0.45} />
      <path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity={active ? 0.7 : 0.4} />
      <circle cx="11.5" cy="5.5" r="1.8" fill={c} opacity={active ? 0.5 : 0.3} />
      <path d="M13 13c0-1.8-1-3-2.5-3.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity={active ? 0.5 : 0.3} />
    </svg>
  );
}

function IconLogs({ active }: { active: boolean }) {
  const c = active ? '#8b5cf6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" opacity={active ? 0.85 : 0.45} />
      <path d="M5.5 8l2 2 3-3" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.9 : 0.5} />
    </svg>
  );
}

function IconApiTokens({ active }: { active: boolean }) {
  const c = active ? '#8b5cf6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="10" cy="6" r="3.5" stroke={c} strokeWidth="1.3" opacity={active ? 0.8 : 0.4} />
      <path d="M7.5 8.5L2.5 13.5v-2h-1v-2h1.5l1.5-1.5" stroke={c} strokeWidth="1.3" strokeLinejoin="round" opacity={active ? 0.9 : 0.5} />
      <circle cx="10.5" cy="5.5" r="0.5" fill={c} opacity={active ? 1 : 0.6} />
    </svg>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const user = getUser();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/');
  };

  const nav = [
    { to: '/dashboard', Icon: IconDashboard, label: 'Dashboard' },
    { to: '/agents', Icon: IconAgents, label: 'Agentes' },
    { to: '/users', Icon: IconUsers, label: 'Usuários' },
    { to: '/logs', Icon: IconLogs, label: 'Logs' },
    { to: '/api-tokens', Icon: IconApiTokens, label: 'API Tokens' },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0d14' }}>
      <aside 
        className={cn(
          'flex flex-col h-full border-r transition-all duration-300 ease-in-out flex-shrink-0',
          collapsed ? 'w-14' : 'w-56'
        )} 
        style={{ background: '#0d1117', borderColor: '#1e2a3a' }}
      >
        <div className={cn('flex items-center h-14 border-b flex-shrink-0 px-3', collapsed ? 'justify-center' : 'gap-2')} style={{ borderColor: '#1e2a3a' }}>
          <svg viewBox="0 0 64 64" width="32" height="32" className="flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="adm-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4b5fd"/>
                <stop offset="100%" stopColor="#8b5cf6"/>
              </linearGradient>
              <linearGradient id="adm-s" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4b5fd"/>
                <stop offset="100%" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="13" fill="#0b1120"/>
            <rect x="13" y="13" width="38" height="38" rx="11" fill="none" stroke="url(#adm-g)" strokeWidth="3.5"/>
            <rect x="20" y="22" width="24" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.95"/>
            <rect x="20" y="30" width="18" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.78"/>
            <rect x="20" y="38" width="12" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.58"/>
          </svg>
          {!collapsed && (
            <div className="flex-1 min-w-0 truncate">
              <span className="text-base tracking-tight text-white block leading-none">
                go<span className="font-bold">State</span>
              </span>
              <span className="text-[10px] font-medium leading-none mt-0.5 tracking-wider uppercase text-purple-400">Admin</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded transition-colors hover:bg-white/5 flex-shrink-0 text-slate-500 hover:text-slate-300"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group',
                  collapsed && 'justify-center px-0',
                  !isActive && 'hover:bg-white/5'
                )
              }
              style={({ isActive }) => isActive 
                ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 500 } 
                : { color: '#94a3b8' }
              }
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  <span className="flex-shrink-0"><item.Icon active={isActive} /></span>
                  {!collapsed && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t" style={{ borderColor: '#1e2a3a' }}>
          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all py-2',
              collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'w-full px-3'
            )}
            title="Sair"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto page-transition" style={{ background: '#0a0d14' }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'));

  useEffect(() => {
    const onStorage = () => setToken(localStorage.getItem('admin_token'));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/"
          element={token ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={() => setToken(localStorage.getItem('admin_token'))} />}
        />
        <Route path="/dashboard" element={<RequireAdmin><Layout><DashboardPage /></Layout></RequireAdmin>} />
        <Route path="/agents" element={<RequireAdmin><Layout><AgentsPage /></Layout></RequireAdmin>} />
        <Route path="/users" element={<RequireAdmin><Layout><UsersPage /></Layout></RequireAdmin>} />
        <Route path="/logs" element={<RequireAdmin><Layout><LogsPage /></Layout></RequireAdmin>} />
        <Route path="/api-tokens" element={<RequireAdmin><Layout><ApiTokensPage /></Layout></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
