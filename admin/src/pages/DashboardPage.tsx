import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bot, Users, Activity, Wifi, Server, CheckCircle2, Trash2, Loader2, AlertTriangle, Calendar } from 'lucide-react';
import { agentsApi, usersApi, healthApi } from '../api';
import api from '../api';

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
  const adminUsers = users.filter(u => u.role === 'admin');

  const today = new Date().toISOString().slice(0, 10);
  const [cleanFrom, setCleanFrom] = useState('');
  const [cleanTo, setCleanTo] = useState(today);
  const [cleanResult, setCleanResult] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cleanArtifacts = useMutation({
    mutationFn: () => api.delete('/api/admin/artifacts', { data: { from: cleanFrom || undefined, to: cleanTo || undefined } }),
    onSuccess: (res: any) => {
      const { deleted_records, deleted_files } = res.data;
      setCleanResult(`${deleted_records} registro(s) removido(s), ${deleted_files} arquivo(s) excluído(s)`);
      setConfirmOpen(false);
      setTimeout(() => setCleanResult(null), 6000);
    },
    onError: () => { setCleanResult('Erro ao limpar artefatos'); setConfirmOpen(false); },
  });

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" /> Dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">Visão geral do sistema goState</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Bot} label="Agentes Total" value={agents.length} color="#06b6d4" />
        <StatCard icon={Wifi} label="Agentes Online" value={onlineAgents.length} color="#10b981" />
        <StatCard icon={Users} label="Usuários" value={users.length} color="#3b82f6" />
        <StatCard icon={Server} label="Admins" value={adminUsers.length} color="#f59e0b" />
      </div>

      {/* Health + Clean Artifacts side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health */}
        {health && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <h2 className="text-sm font-semibold text-white">Backend Health</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Status</p>
                <p className="text-green-400 font-medium capitalize">{health.status || 'ok'}</p>
              </div>
              {health.uptime !== undefined && (
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

        {/* Clean Artifacts */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Limpar Artefatos</h2>
          </div>
          <p className="text-xs text-slate-400 mb-3">Remove artefatos (vídeos, screenshots) do banco e disco para liberar espaço.</p>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <label className="text-xs text-slate-500 whitespace-nowrap">De</label>
              <input
                type="date"
                className="text-xs rounded-lg px-2 py-1.5 border outline-none"
                style={{ background: '#0d1117', borderColor: '#1e2a3a', color: '#e2e8f0' }}
                value={cleanFrom}
                onChange={e => setCleanFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 whitespace-nowrap">Até</label>
              <input
                type="date"
                className="text-xs rounded-lg px-2 py-1.5 border outline-none"
                style={{ background: '#0d1117', borderColor: '#1e2a3a', color: '#e2e8f0' }}
                value={cleanTo}
                onChange={e => setCleanTo(e.target.value)}
              />
            </div>
          </div>

          {cleanResult && (
            <div className="text-xs px-3 py-2 rounded-lg mb-3 flex items-center gap-2"
              style={{ background: cleanResult.startsWith('Erro') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: cleanResult.startsWith('Erro') ? '#f87171' : '#34d399' }}>
              {cleanResult}
            </div>
          )}

          {!confirmOpen ? (
            <button
              className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium transition-all"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar artefatos{cleanFrom ? ` de ${cleanFrom}` : ''}{cleanTo ? ` até ${cleanTo}` : ''}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-400 flex-1">Confirmar exclusão permanente?</span>
              <button
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}
                disabled={cleanArtifacts.isPending}
                onClick={() => cleanArtifacts.mutate()}
              >
                {cleanArtifacts.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Confirmar
              </button>
              <button className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Agents + Users side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agents status */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" /> Status dos Agentes
          </h2>
          {agents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Nenhum agente cadastrado</p>
          ) : (
            <div className="space-y-2">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: '#1e2a3a' }}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.status === 'online' ? 'bg-green-400' : 'bg-slate-600'}`} />
                  <span className="text-sm text-white flex-1 truncate">{agent.name}</span>
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
            <Users className="w-4 h-4 text-blue-400" /> Usuários
          </h2>
          {users.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Nenhum usuário cadastrado</p>
          ) : (
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: '#1e2a3a' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: user.role === 'admin' ? '#0891b2' : '#2563eb' }}>
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{user.name || '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-blue-500/15 text-blue-300'}`}>
                    {user.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-700 text-center pb-2">
        goState Admin Panel · atualizado a cada 15s · porta 4001
      </div>
    </div>
  );
}
