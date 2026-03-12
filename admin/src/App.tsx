import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { Users, Bot, Activity, LogOut, ScrollText, KeyRound } from 'lucide-react';
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

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/');
  };

  const nav = [
    { to: '/dashboard', icon: Activity, label: 'Dashboard' },
    { to: '/agents', icon: Bot, label: 'Agentes' },
    { to: '/users', icon: Users, label: 'Usuários' },
    { to: '/logs', icon: ScrollText, label: 'Logs' },
    { to: '/api-tokens', icon: KeyRound, label: 'API Tokens' },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex flex-col w-56 flex-shrink-0 border-r" style={{ background: '#0d1117', borderColor: '#1e2a3a' }}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b" style={{ borderColor: '#1e2a3a' }}>
          <svg viewBox="0 0 64 64" width="28" height="28" className="flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="adm-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4b5fd"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
              <linearGradient id="adm-s" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4b5fd"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="13" fill="#0b1120"/>
            <rect x="13" y="13" width="38" height="38" rx="11" fill="none" stroke="url(#adm-g)" strokeWidth="3.5"/>
            <rect x="20" y="22" width="24" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.95"/>
            <rect x="20" y="30" width="18" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.78"/>
            <rect x="20" y="38" width="12" height="5" rx="2.5" fill="url(#adm-s)" opacity="0.58"/>
          </svg>
          <div>
            <p className="text-sm leading-none text-white">go<span className="font-bold">State</span></p>
            <p className="text-xs leading-none mt-0.5" style={{ color: '#a78bfa' }}>Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive ? 'text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
              style={({ isActive }) => isActive ? { background: 'rgba(124,58,237,0.2)', color: '#a78bfa' } : {}}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t" style={{ borderColor: '#1e2a3a' }}>
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-white truncate">{user?.name || 'Admin'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto" style={{ background: '#0a0d14' }}>
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
