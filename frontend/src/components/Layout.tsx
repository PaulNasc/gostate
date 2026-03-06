import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, FolderOpen, PlayCircle, Users, Server,
  LogOut, ChevronRight, Menu, CalendarClock, Webhook, Code2, BarChart3,
  Sun, Moon
} from 'lucide-react';
import GoStateIcon from './GoStateIcon';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderOpen, label: 'Projetos' },
  { to: '/executions', icon: PlayCircle, label: 'Execuções' },
  { to: '/reports', icon: BarChart3, label: 'Relatórios' },
  { to: '/scheduler', icon: CalendarClock, label: 'Agendamentos' },
  { to: '/scripts', icon: Code2, label: 'Scripts' },
  { to: '/integrations', icon: Webhook, label: 'Integrações' },
  { to: '/agents', icon: Server, label: 'Agentes' },
  { to: '/users', icon: Users, label: 'Usuários', adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('gostate:theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gostate:theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col h-full border-r transition-all duration-300 ease-in-out flex-shrink-0',
          collapsed ? 'w-14' : 'w-56'
        )}
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div className={cn('flex items-center h-14 border-b flex-shrink-0 px-3', collapsed ? 'justify-center' : 'gap-2')} style={{ borderColor: 'var(--border)' }}>
          <GoStateIcon size={32} className="flex-shrink-0" />
          {!collapsed && (
            <span className="text-base tracking-tight flex-1 truncate" style={{ color: 'var(--text)' }}>
              go<span className="font-bold">State</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded transition-colors hover:bg-black/10 flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'admin') return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group',
                    collapsed && 'justify-center px-0',
                    !isActive && 'hover:bg-black/5'
                  )
                }
                style={({ isActive }) => isActive
                  ? { background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active-text)', fontWeight: 500 }
                  : { color: 'var(--text-muted)' }
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                {user?.role === 'admin' ? 'Administrador' : user?.role === 'tester' ? 'Testador' : user?.role}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
            </div>
          )}
          <div className={cn('flex gap-1', collapsed ? 'flex-col items-center' : 'flex-col')}>
            <button
              onClick={toggleTheme}
              className={cn(
                'flex items-center gap-2 rounded-lg text-sm transition-all hover:bg-black/5 py-2',
                collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'w-full px-3'
              )}
              style={{ color: 'var(--text-muted)' }}
              title={theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4 flex-shrink-0 text-yellow-400" />
                : <Moon className="w-4 h-4 flex-shrink-0 text-indigo-500" />}
              {!collapsed && (
                <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className={cn(
                'flex items-center gap-2 rounded-lg text-sm hover:text-red-400 hover:bg-red-500/10 transition-all py-2',
                collapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'w-full px-3'
              )}
              style={{ color: 'var(--text-muted)' }}
              title="Sair"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Sair</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
