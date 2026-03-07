import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ChevronRight, Menu, Sun, Moon } from 'lucide-react';
import GoStateIcon from './GoStateIcon';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

// Custom SVG nav icons — original, minimal, colored
function IconDashboard({ active }: { active: boolean }) {
  const c = active ? '#3b62f6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill={c} opacity={active ? 1 : 0.5} />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill={c} opacity={active ? 0.6 : 0.3} />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill={c} opacity={active ? 0.6 : 0.3} />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill={c} opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function IconProjects({ active }: { active: boolean }) {
  const c = active ? '#f59e0b' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 4.5C1 3.67 1.67 3 2.5 3h3.17c.35 0 .69.12.96.34L7.5 4H13.5C14.33 4 15 4.67 15 5.5v7c0 .83-.67 1.5-1.5 1.5h-11C1.67 14 1 13.33 1 12.5v-8z" fill={c} opacity={active ? 0.2 : 0.15} />
      <path d="M1 6h14" stroke={c} strokeWidth="1.2" strokeOpacity={active ? 0.6 : 0.4} />
      <path d="M1 4.5C1 3.67 1.67 3 2.5 3h3.17c.35 0 .69.12.96.34L7.5 4H13.5C14.33 4 15 4.67 15 5.5V6H1V4.5z" fill={c} opacity={active ? 0.8 : 0.5} />
    </svg>
  );
}

function IconExecutions({ active }: { active: boolean }) {
  const c = active ? '#22c55e' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="1.3" opacity={active ? 0.4 : 0.25} />
      <path d="M6 5.5l5 2.5-5 2.5V5.5z" fill={c} opacity={active ? 1 : 0.6} />
    </svg>
  );
}

function IconReports({ active }: { active: boolean }) {
  const c = active ? '#a78bfa' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="9" width="2.5" height="5" rx="0.8" fill={c} opacity={active ? 1 : 0.5} />
      <rect x="6" y="6" width="2.5" height="8" rx="0.8" fill={c} opacity={active ? 0.8 : 0.4} />
      <rect x="10" y="3" width="2.5" height="11" rx="0.8" fill={c} opacity={active ? 0.6 : 0.3} />
      <path d="M3 9 L7 6 L11 3" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={active ? 0.5 : 0.3} />
    </svg>
  );
}

function IconScheduler({ active }: { active: boolean }) {
  const c = active ? '#fb923c' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke={c} strokeWidth="1.3" opacity={active ? 0.5 : 0.3} />
      <path d="M2 6.5h12" stroke={c} strokeWidth="1.2" opacity={active ? 0.6 : 0.35} />
      <path d="M5.5 1.5v2M10.5 1.5v2" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity={active ? 0.9 : 0.5} />
      <circle cx="8" cy="10.5" r="1.5" fill={c} opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function IconScripts({ active }: { active: boolean }) {
  const c = active ? '#38bdf8' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4.5 5.5L2 8l2.5 2.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : 0.5} />
      <path d="M11.5 5.5L14 8l-2.5 2.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : 0.5} />
      <path d="M9.5 3.5l-3 9" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity={active ? 0.7 : 0.35} />
    </svg>
  );
}

function IconIntegrations({ active }: { active: boolean }) {
  const c = active ? '#f472b6' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="3.5" cy="8" r="2" fill={c} opacity={active ? 0.9 : 0.5} />
      <circle cx="12.5" cy="4" r="2" fill={c} opacity={active ? 0.7 : 0.35} />
      <circle cx="12.5" cy="12" r="2" fill={c} opacity={active ? 0.7 : 0.35} />
      <path d="M5.5 8h3l1.5-4" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={active ? 0.6 : 0.3} />
      <path d="M8.5 8l1.5 4" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity={active ? 0.6 : 0.3} />
    </svg>
  );
}

function IconAgents({ active }: { active: boolean }) {
  const c = active ? '#34d399' : 'currentColor';
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
  const c = active ? '#c084fc' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.5" fill={c} opacity={active ? 0.8 : 0.45} />
      <path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity={active ? 0.7 : 0.4} />
      <circle cx="11.5" cy="5.5" r="1.8" fill={c} opacity={active ? 0.5 : 0.3} />
      <path d="M13 13c0-1.8-1-3-2.5-3.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity={active ? 0.5 : 0.3} />
    </svg>
  );
}

function IconAudit({ active }: { active: boolean }) {
  const c = active ? '#a78bfa' : 'currentColor';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" opacity={active ? 0.85 : 0.45} />
      <path d="M5.5 8l2 2 3-3" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.9 : 0.5} />
    </svg>
  );
}

const navItems = [
  { to: '/dashboard',    Icon: IconDashboard,    label: 'Dashboard' },
  { to: '/projects',     Icon: IconProjects,     label: 'Projetos' },
  { to: '/executions',   Icon: IconExecutions,   label: 'Execuções' },
  { to: '/reports',      Icon: IconReports,      label: 'Relatórios' },
  { to: '/scheduler',    Icon: IconScheduler,    label: 'Agendamentos' },
  { to: '/scripts',      Icon: IconScripts,      label: 'Scripts' },
  { to: '/integrations', Icon: IconIntegrations, label: 'Integrações' },
  { to: '/agents',       Icon: IconAgents,       label: 'Agentes' },
  { to: '/users',        Icon: IconUsers,        label: 'Usuários', adminOnly: true },
  { to: '/audit',        Icon: IconAudit,        label: 'Auditoria', adminOnly: true },
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
                {({ isActive }) => (
                  <>
                    <span className="flex-shrink-0"><item.Icon active={isActive} /></span>
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )}
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
