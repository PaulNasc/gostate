import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsApi, agentsApi as agentsApiToken, API_BASE } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Server, Loader2, Wifi, ExternalLink, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, Terminal, Container } from 'lucide-react';
import { io as socketIo } from 'socket.io-client';

const BACKEND_URL = (import.meta as any).env?.VITE_API_BASE || window.location.origin.replace(/:\d+$/, ':4000');
const IS_LOCALHOST = BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1');

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="p-1 rounded transition-colors flex-shrink-0"
      style={{ color: copied ? '#10b981' : 'var(--text-muted)' }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function AgentGuide({ token }: { token: string }) {
  const envBlock = `BACKEND_URL=${BACKEND_URL}\nAGENT_TOKEN=${token}`;
  const dockerCmd = `docker run -d --name gostate-agent \\
  -e BACKEND_URL=${BACKEND_URL} \\
  -e AGENT_TOKEN=${token} \\
  gostate/agent:latest`;
  const nodeCmd = `BACKEND_URL=${BACKEND_URL} AGENT_TOKEN=${token} node dist/index.js`;

  return (
    <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
      {IS_LOCALHOST && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            <strong>Atenção:</strong> BACKEND_URL aponta para <code className="font-mono bg-amber-500/10 px-1 rounded">localhost</code>.
            Agentes externos não conseguirão acessar este endereço. Use o IP ou domínio da máquina do backend.
          </p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: 'var(--text)' }}>
          <Terminal className="w-3 h-3" /> Variáveis de ambiente
        </p>
        <div className="relative rounded-lg overflow-hidden" style={{ background: 'var(--surface-3)' }}>
          <div className="absolute top-2 right-2"><CopyButton text={envBlock} /></div>
          <pre className="text-xs font-mono p-3 pr-10 overflow-x-auto" style={{ color: '#a5f3fc' }}>{envBlock}</pre>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: 'var(--text)' }}>
          <Container className="w-3 h-3" /> Docker
        </p>
        <div className="relative rounded-lg overflow-hidden" style={{ background: 'var(--surface-3)' }}>
          <div className="absolute top-2 right-2"><CopyButton text={dockerCmd} /></div>
          <pre className="text-xs font-mono p-3 pr-10 overflow-x-auto whitespace-pre-wrap" style={{ color: '#a5f3fc' }}>{dockerCmd}</pre>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: 'var(--text)' }}>
          <Terminal className="w-3 h-3" /> Bare metal (Node.js)
        </p>
        <div className="relative rounded-lg overflow-hidden" style={{ background: 'var(--surface-3)' }}>
          <div className="absolute top-2 right-2"><CopyButton text={nodeCmd} /></div>
          <pre className="text-xs font-mono p-3 pr-10 overflow-x-auto whitespace-pre-wrap" style={{ color: '#a5f3fc' }}>{nodeCmd}</pre>
        </div>
      </div>
    </div>
  );
}

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
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [agentTokens, setAgentTokens] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list(), refetchInterval: 15000 });

  const fetchToken = async (agentId: string) => {
    if (agentTokens[agentId]) return agentTokens[agentId];
    try {
      const res = await agentsApiToken.getToken(agentId);
      const token = res.data?.token || res.data?.agent_token || '••••••••';
      setAgentTokens(prev => ({ ...prev, [agentId]: token }));
      return token;
    } catch {
      return '(token indisponível — consulte o painel Admin)';
    }
  };

  const toggleGuide = async (agentId: string) => {
    if (expandedGuide === agentId) { setExpandedGuide(null); return; }
    await fetchToken(agentId);
    setExpandedGuide(agentId);
  };

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
                <div className="flex items-center gap-2">
                  {agent.status !== 'offline' ? (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                      <Wifi className="w-3 h-3" /> ao vivo
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>offline</span>
                  )}
                  <button
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors border"
                    style={expandedGuide === agent.id
                      ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'rgba(59,130,246,0.08)' }
                      : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    onClick={() => toggleGuide(agent.id)}
                  >
                    {expandedGuide === agent.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Como conectar
                  </button>
                </div>
              </div>

              {expandedGuide === agent.id && agentTokens[agent.id] && (
                <AgentGuide token={agentTokens[agent.id]} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
