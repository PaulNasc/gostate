import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { Users, Bot, Activity, LogOut } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import AgentsPage from './pages/AgentsPage';
import UsersPage from './pages/UsersPage';
import DashboardPage from './pages/DashboardPage';

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
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex flex-col w-56 flex-shrink-0 border-r" style={{ background: '#0d1117', borderColor: '#1e2a3a' }}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b" style={{ borderColor: '#1e2a3a' }}>
          <svg viewBox="0 0 64 64" fill="none" width="28" height="28" className="flex-shrink-0">
            <defs>
              <linearGradient id="adm-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#13103a"/>
                <stop offset="100%" stopColor="#1e1060"/>
              </linearGradient>
              <linearGradient id="adm-icon" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="14" fill="url(#adm-bg)"/>
            <path d="M 14 26 C 14 16 28 11 38 16" stroke="url(#adm-icon)" strokeWidth="5.5" strokeLinecap="round" fill="none"/>
            <polyline points="34,12 39,17 34,22" stroke="url(#adm-icon)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M 50 38 C 50 48 36 53 26 48" stroke="url(#adm-icon)" strokeWidth="5.5" strokeLinecap="round" fill="none"/>
            <polyline points="30,52 25,47 30,42" stroke="url(#adm-icon)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
