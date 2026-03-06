import { useQuery } from '@tanstack/react-query';
import { Bot, Users, Activity, Wifi, WifiOff, Server, CheckCircle2 } from 'lucide-react';
import { agentsApi, usersApi, healthApi } from '../api';

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function timeSince(d: string | null | undefined) {
  if (!d) return 'nunca';
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  const diff = Math.round((Date.now() - new Date(normalized).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

export default function DashboardPage() {
  const { data: agentsData } = useQuery({ queryKey: ['admin-agents'], queryFn: () => agentsApi.list(), refetchInterval: 15000 });
  const { data: usersData } = useQuery({ queryKey: ['admin-users'], queryFn: () => usersApi.list() });
  const { data: healthData } = useQuery({ queryKey: ['admin-health'], queryFn: () => healthApi.get(), refetchInterval: 30000 });

  const agents: any[] = agentsData?.data?.agents || [];
  const users: any[] = usersData?.data?.users || [];
  const health = healthData?.data;

  const onlineAgents = agents.filter(a => a.status === 'online');
  const offlineAgents = agents.filter(a => a.status !== 'online');
  const adminUsers = users.filter(u => u.role === 'admin');

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-400" /> Dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">Visão geral do sistema goState</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Bot} label="Agentes Total" value={agents.length} color="#8b5cf6" />
        <StatCard icon={Wifi} label="Agentes Online" value={onlineAgents.length} color="#10b981" />
        <StatCard icon={Users} label="Usuários" value={users.length} color="#3b82f6" />
        <StatCard icon={Server} label="Admins" value={adminUsers.length} color="#f59e0b" />
      </div>

      {/* Health */}
      {health && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-semibold text-white">Backend Health</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Status</p>
              <p className="text-green-400 font-medium capitalize">{health.status || 'ok'}</p>
            </div>
            {health.uptime && (
              <div>
                <p className="text-slate-500">Uptime</p>
                <p className="text-white font-medium">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}min</p>
              </div>
            )}
            {health.version && (
              <div>
                <p className="text-slate-500">Versão</p>
                <p className="text-white font-medium">{health.version}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500">Backend</p>
              <p className="text-white font-medium">localhost:4000</p>
            </div>
          </div>
        </div>
      )}

      {/* Agents status */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" /> Status dos Agentes
        </h2>
        {agents.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nenhum agente cadastrado</p>
        ) : (
          <div className="space-y-2">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: '#1e2a3a' }}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.status === 'online' ? 'bg-green-400' : 'bg-slate-600'}`} />
                <span className="text-sm text-white flex-1">{agent.name}</span>
                <span className={`text-xs ${agent.status === 'online' ? 'text-green-400' : 'text-slate-500'}`}>
                  {agent.status === 'online' ? 'Online' : 'Offline'}
                </span>
                <span className="text-xs text-slate-600">{timeSince(agent.last_heartbeat)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users list */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" /> Usuários Recentes
        </h2>
        {users.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nenhum usuário cadastrado</p>
        ) : (
          <div className="space-y-2">
            {users.slice(0, 8).map(user => (
              <div key={user.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: '#1e2a3a' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: user.role === 'admin' ? '#7c3aed' : '#2563eb' }}>
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{user.name || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-violet-500/15 text-violet-300' : 'bg-blue-500/15 text-blue-300'}`}>
                  {user.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-700 text-center pb-2">
        goState Admin Panel · atualizado a cada 15s · porta 4001
      </div>
    </div>
  );
}
