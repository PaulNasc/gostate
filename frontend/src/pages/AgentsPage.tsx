import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsApi, API_BASE } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Server, Loader2, Wifi, ExternalLink } from 'lucide-react';
import { io as socketIo } from 'socket.io-client';

function StatusBadge({ status }: { status: string }) {
  if (status === 'online') return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
      </span>
      <span className="text-xs font-medium text-green-400">Online</span>
    </span>
  );
  if (status === 'busy') return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
      </span>
      <span className="text-xs font-medium text-yellow-400">Executando</span>
    </span>
  );
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex rounded-full h-2 w-2 bg-slate-600" />
      <span className="text-xs font-medium text-slate-500">Offline</span>
    </span>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list(), refetchInterval: 15000 });

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token) return;
    const socket = socketIo(API_BASE, { auth: { token } });
    socket.on('agent:online', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('agent:offline', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('agent:busy', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('exec:started', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('exec:finished', () => qc.invalidateQueries({ queryKey: ['agents'] }));
    return () => { socket.disconnect(); };
  }, [qc]);
  const agents: any[] = data?.data?.agents || [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Agentes de Execução</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {agents.filter(a => a.status !== 'offline').length} online · {agents.filter(a => a.status === 'busy').length} executando · {agents.filter(a => a.status === 'offline').length} offline
          </p>
        </div>
        <a
          href="http://localhost:4001/agents"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-violet-500/10 text-violet-400 border border-violet-500/20"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Gerenciar no Admin
        </a>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : agents.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum agente registrado</p>
          <p className="text-sm text-slate-600 mt-1">Acesse o painel Admin para cadastrar agentes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="card p-4" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  agent.status === 'online' ? 'bg-green-500/10' :
                  agent.status === 'busy' ? 'bg-yellow-500/10' : 'bg-slate-500/10'
                }`}>
                  <Server className={`w-5 h-5 ${
                    agent.status === 'online' ? 'text-green-400' :
                    agent.status === 'busy' ? 'text-yellow-400' : 'text-slate-500'
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{agent.name}</p>
                  <div className="mt-0.5">
                    <StatusBadge status={agent.status} />
                  </div>
                </div>
              </div>

              {agent.capabilities && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(agent.capabilities.browsers || []).map((b: string) => (
                    <span key={b} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{b}</span>
                  ))}
                  {(agent.capabilities.frameworks || []).map((f: string) => (
                    <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{f}</span>
                  ))}
                  {agent.capabilities.max_concurrent && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400">max {agent.capabilities.max_concurrent}x</span>
                  )}
                </div>
              )}

              <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Heartbeat: {agent.last_heartbeat ? formatDate(agent.last_heartbeat) : '—'}
                </span>
                {agent.status !== 'offline' ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <Wifi className="w-3 h-3" /> ao vivo
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>offline</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
