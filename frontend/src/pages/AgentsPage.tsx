import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsApi, API_BASE } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Server, Loader2, Wifi, ExternalLink, Activity, Clock, Copy, CheckCircle2 } from 'lucide-react';
import { io as socketIo } from 'socket.io-client';

const CARD_H = '210px';

const STATUS_CFG = {
  online:  { label: 'Online',     dot: 'bg-green-400',  ping: 'bg-green-400',  icon: 'text-green-400',  iconBg: 'rgba(34,197,94,0.15)',  border: '#22c55e40', gradient: 'rgba(34,197,94,0.08)'  },
  busy:    { label: 'Executando', dot: 'bg-yellow-400', ping: 'bg-yellow-400', icon: 'text-yellow-400', iconBg: 'rgba(234,179,8,0.15)',  border: '#eab30840', gradient: 'rgba(234,179,8,0.08)'  },
  offline: { label: 'Offline',    dot: 'bg-slate-600',  ping: '',              icon: 'text-slate-500',  iconBg: 'rgba(100,116,139,0.15)', border: '#47556940', gradient: 'rgba(100,116,139,0.05)' },
};

function timeSince(d: string | null | undefined) {
  if (!d) return null;
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  const diff = Math.round((Date.now() - new Date(normalized).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

export default function AgentsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list(), refetchInterval: 15000 });

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token) return;
    const socket = socketIo(API_BASE, { auth: { token } });
    socket.on('agent:online',   () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('agent:offline',  () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('agent:busy',     () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('exec:started',   () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on('exec:finished',  () => qc.invalidateQueries({ queryKey: ['agents'] }));
    return () => { socket.disconnect(); };
  }, [qc]);

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const agents: any[] = data?.data?.agents || [];
  const onlineCount = agents.filter(a => a.status === 'online').length;
  const busyCount   = agents.filter(a => a.status === 'busy').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Agentes de Execução</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {onlineCount} online · {busyCount} executando · {offlineCount} offline
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
          <p className="text-sm text-slate-600 mt-1">Acesse o painel Admin para cadastrar e configurar agentes</p>
        </div>
      ) : (
        <>
          <style>{`
            .agent-flip { perspective: 1000px; }
            .agent-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
            .agent-flip:hover .agent-flip-inner { transform: rotateY(180deg); }
            .agent-flip-front, .agent-flip-back { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 0.75rem; }
            .agent-flip-back { transform: rotateY(180deg); }
          `}</style>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {agents.map((agent) => {
              const cfg = STATUS_CFG[agent.status as keyof typeof STATUS_CFG] || STATUS_CFG.offline;
              const caps = agent.capabilities || {};
              const browsers: string[] = caps.browsers || [];
              const frameworks: string[] = caps.frameworks || [];

              return (
                <div key={agent.id} className="agent-flip" style={{ height: CARD_H, minHeight: CARD_H }}>
                  <div className="agent-flip-inner" style={{ height: CARD_H }}>

                    {/* ── FRENTE ── */}
                    <div
                      className="agent-flip-front flex flex-col items-center justify-center gap-3 p-5"
                      style={{ background: 'var(--surface-1)', border: `1px solid ${cfg.border}` }}
                    >
                      {/* Pulsing dot top-right */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        {agent.status !== 'offline' ? (
                          <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.ping} opacity-75`} />
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
                          </span>
                        ) : (
                          <span className={`inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
                        )}
                      </div>

                      {/* Icon */}
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: cfg.iconBg, border: `1px solid ${cfg.border}` }}>
                        {agent.status === 'busy'
                          ? <Activity className={`w-7 h-7 ${cfg.icon}`} />
                          : <Server className={`w-7 h-7 ${cfg.icon}`} />
                        }
                      </div>

                      {/* Status tag */}
                      <span className={cfg.icon}
                        style={{ display: 'inline-flex', alignItems: 'center', background: cfg.iconBg, border: `1px solid ${cfg.border}`, borderRadius: '4px', padding: '0.125rem 0.5rem', fontSize: '0.75rem', fontWeight: 500 }}>
                        {cfg.label}
                      </span>

                      {/* Name */}
                      <p className="text-sm font-bold text-center leading-tight" style={{ color: 'var(--text)' }}>
                        {agent.name}
                      </p>

                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Passe o mouse para detalhes</p>
                    </div>

                    {/* ── VERSO ── */}
                    <div
                      className="agent-flip-back flex flex-col p-4"
                      style={{ background: 'var(--surface-1)', border: `1px solid ${cfg.border}` }}
                    >
                      {/* Back header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: cfg.iconBg }}>
                          <Server className={`w-4 h-4 ${cfg.icon}`} />
                        </div>
                        <span className="text-xs font-bold truncate flex-1" style={{ color: 'var(--text)' }}>{agent.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${cfg.icon}`}
                          style={{ background: cfg.iconBg, borderColor: cfg.border }}>
                          {cfg.label}
                        </span>
                      </div>

                      {/* Heartbeat */}
                      <p className="text-xs mb-1 truncate" style={{ color: 'var(--text-muted)' }}>
                        {agent.last_heartbeat
                          ? `${timeSince(agent.last_heartbeat)} · ${formatDate(agent.last_heartbeat)}`
                          : 'Nunca conectado'}
                      </p>

                      {/* ID — clicável para copiar */}
                      <button
                        className="flex items-center gap-1.5 text-xs font-mono mb-2 px-1 py-0.5 rounded transition-all w-full text-left"
                        style={{ color: 'var(--text-muted)' }}
                        title="Clique para copiar ID"
                        onClick={() => copyId(agent.id)}
                      >
                        {copiedId === agent.id
                          ? <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                          : <Copy className="w-3 h-3 flex-shrink-0" />}
                        <code>#{agent.id.slice(0, 12)}…</code>
                      </button>

                      {/* Capabilities */}
                      <div className="flex flex-wrap gap-1 mb-auto">
                        {browsers.map((b: string) => (
                          <span key={b} className="text-xs px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">{b}</span>
                        ))}
                        {frameworks.map((f: string) => (
                          <span key={f} className="text-xs px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">{f}</span>
                        ))}
                        {caps.max_concurrent && (
                          <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">
                            max {caps.max_concurrent}x
                          </span>
                        )}
                        {!browsers.length && !frameworks.length && (
                          <span className="text-xs px-1.5 py-0.5 rounded border" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                            Sem capabilities
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="pt-2 mt-2 border-t flex items-center" style={{ borderColor: 'var(--border)' }}>
                        {agent.status !== 'offline' ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <Wifi className="w-3 h-3" /> ao vivo
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>desconectado</span>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
