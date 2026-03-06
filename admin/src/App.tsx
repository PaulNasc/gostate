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
          <svg viewBox="0 0 100 100" width="28" height="28" className="flex-shrink-0">
            <defs>
              <linearGradient id="adm-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0f0c24"/>
                <stop offset="100%" stopColor="#1a1245"/>
              </linearGradient>
              <linearGradient id="adm-a" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#e0d4ff"/>
                <stop offset="45%"  stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#6d28d9"/>
              </linearGradient>
              <linearGradient id="adm-b" x1="10" y1="50" x2="60" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#a78bfa"/>
                <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.7"/>
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="22" fill="url(#adm-bg)"/>
            <path d="M 30 72 C 20 80 12 88 16 96 C 20 100 26 96 28 88 C 30 82 32 78 36 74 Z" fill="url(#adm-b)" opacity="0.9"/>
            <path d="M 36 70 C 28 76 22 84 28 93 C 32 98 38 93 38 85 C 38 79 40 74 44 70 Z" fill="url(#adm-b)" opacity="0.75"/>
            <path d="M 44 68 C 38 73 34 80 40 88 C 44 93 50 88 48 81 C 47 76 48 71 52 68 Z" fill="url(#adm-b)" opacity="0.6"/>
            <path d="M 42 58 C 36 64 28 68 18 70 C 14 71 12 68 15 66 C 22 62 30 58 36 52 C 38 50 40 48 42 46 C 46 54 44 56 42 58 Z" fill="url(#adm-a)" opacity="0.85"/>
            <path d="M 48 44 C 44 34 38 22 28 14 C 24 11 20 12 20 16 C 20 20 26 24 32 30 C 38 36 42 40 46 48 C 46 48 48 46 48 44 Z" fill="url(#adm-a)"/>
            <path d="M 44 52 C 40 44 42 34 50 26 C 56 20 64 18 70 20 C 76 22 78 28 74 34 C 70 40 62 44 56 48 C 52 50 48 52 44 52 Z" fill="url(#adm-a)"/>
            <path d="M 68 14 C 64 10 58 10 56 14 C 54 18 56 24 60 26 C 64 28 70 26 72 22 C 74 18 72 16 68 14 Z" fill="url(#adm-a)"/>
            <path d="M 72 16 L 82 11 L 76 20 Z" fill="#e0d4ff" opacity="0.9"/>
            <circle cx="63" cy="18" r="2.2" fill="#0f0c24" opacity="0.8"/>
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
