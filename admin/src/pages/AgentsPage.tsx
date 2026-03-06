import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, RefreshCw, Copy, CheckCircle2, Loader2, Wifi, WifiOff, KeyRound, AlertTriangle, Settings2, Terminal, Activity } from 'lucide-react';
import { agentsApi } from '../api';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(normalized));
  } catch { return d; }
}

function timeSince(d: string | null | undefined) {
  if (!d) return null;
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  const diff = Math.round((Date.now() - new Date(normalized).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

type DeployConfig = {
  backend_url?: string;
  docker_image?: string;
  node_env?: string;
  extra_env?: string;
  notes?: string;
  max_concurrent?: number;
};

type InstallCommands = {
  docker_bash: string;
  docker_powershell: string;
  npm_powershell: string;
  npm_bash: string;
  docker_compose: string;
};

function DeployPanel({ agent, onClose }: { agent: any; onClose: () => void }) {
  const qc = useQueryClient();
  const dc = typeof agent.deploy_config === 'string' ? JSON.parse(agent.deploy_config || '{}') : (agent.deploy_config || {});
  const [cfg, setCfg] = useState<DeployConfig>({
    backend_url: dc.backend_url || '',
    docker_image: dc.docker_image || 'node:20-slim',
    node_env: dc.node_env || 'production',
    extra_env: dc.extra_env || '',
    notes: dc.notes || '',
    max_concurrent: dc.max_concurrent ?? (agent.capabilities?.max_concurrent ?? 2),
  });
  const [commands, setCommands] = useState<InstallCommands | null>(null);
  const [activeCmd, setActiveCmd] = useState<keyof InstallCommands>('docker_powershell');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const save = async () => {
    setSaving(true);
    try {
      await agentsApi.saveDeployConfig(agent.id, cfg as Record<string, string>);
      // also update capabilities.max_concurrent via PUT /:id
      if (cfg.max_concurrent !== undefined) {
        await agentsApi.updateCapabilities(agent.id, { max_concurrent: cfg.max_concurrent });
      }
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      showToast('Configuração salva');
    } catch { showToast('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const generate = async () => {
    setLoading(true);
    try {
      await agentsApi.saveDeployConfig(agent.id, cfg as Record<string, string>);
      const res = await agentsApi.getInstallCommand(agent.id);
      setCommands(res.data.commands);
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
    } catch { showToast('Erro ao gerar comandos'); }
    finally { setLoading(false); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const cmdLabels: Record<keyof InstallCommands, string> = {
    docker_powershell: '🪟 Docker (PowerShell)',
    docker_bash: '🐧 Docker (bash/Linux)',
    npm_powershell: '🪟 NPM local (PowerShell)',
    npm_bash: '🐧 NPM local (bash)',
    docker_compose: 'docker-compose.yml',
  };
  const currentCmd = commands ? commands[activeCmd] : '';

  return (
    <div className="card p-5 space-y-5 border-violet-500/30">
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm bg-violet-500/20 text-violet-300 border border-violet-500/30">{toast}</div>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Configurar Agente: <span className="text-violet-300">{agent.name}</span></h3>
        </div>
        <button className="btn-ghost text-xs" onClick={onClose}>Fechar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">URL do Backend <span className="text-slate-600">(ex: http://192.168.1.10:4000)</span></label>
          <input className="input" placeholder="http://seu-servidor:4000" value={cfg.backend_url} onChange={e => setCfg(p => ({ ...p, backend_url: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Imagem Docker <span className="text-slate-600">(base)</span></label>
          <input className="input" placeholder="node:20-slim" value={cfg.docker_image} onChange={e => setCfg(p => ({ ...p, docker_image: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">NODE_ENV</label>
          <select className="input" value={cfg.node_env} onChange={e => setCfg(p => ({ ...p, node_env: e.target.value }))}>
            <option value="production">production</option>
            <option value="development">development</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Variáveis extras <span className="text-slate-600">(uma por linha: CHAVE=valor)</span></label>
          <textarea className="input font-mono text-xs resize-none" rows={2} placeholder={"PROXY_URL=http://...\nHEADLESS=true"} value={cfg.extra_env} onChange={e => setCfg(p => ({ ...p, extra_env: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">Execuções paralelas <span className="text-slate-600">(max_concurrent)</span></label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-8 h-8 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-red-500/10 hover:border-red-500/40 transition-all"
              onClick={() => setCfg(p => ({ ...p, max_concurrent: Math.max(1, (p.max_concurrent ?? 2) - 1) }))}
            >−</button>
            <span className="w-8 text-center font-bold text-white text-sm">{cfg.max_concurrent ?? 2}</span>
            <button
              type="button"
              className="w-8 h-8 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-green-500/10 hover:border-green-500/40 transition-all"
              onClick={() => setCfg(p => ({ ...p, max_concurrent: Math.min(20, (p.max_concurrent ?? 2) + 1) }))}
            >+</button>
            <span className="text-xs text-slate-500">testes simultâneos por agente</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Notas internas</label>
          <input className="input" placeholder="Ex: Servidor AWS us-east-1, 4 cores" value={cfg.notes} onChange={e => setCfg(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex items-center gap-2" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
          Gerar Comando de Instalação
        </button>
        <button className="btn-ghost flex items-center gap-2 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Salvar Config
        </button>
      </div>

      {commands && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.keys(cmdLabels) as Array<keyof typeof cmdLabels>).map(k => (
              <button
                key={k}
                onClick={() => setActiveCmd(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeCmd === k ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
              >
                {cmdLabels[k]}
              </button>
            ))}
          </div>

          <div className="relative rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid #2a3352' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#2a3352' }}>
              <span className="text-xs text-slate-500 font-mono">{activeCmd === 'docker_compose' ? 'docker-compose.yml' : activeCmd.includes('powershell') ? 'powershell' : 'bash'}</span>
              <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-all" onClick={() => copy(currentCmd)}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <pre className="p-4 text-xs text-violet-200 font-mono overflow-x-auto whitespace-pre leading-relaxed">{currentCmd}</pre>
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-500 rounded-lg p-3" style={{ background: '#1a2035', border: '1px solid #2a3352' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-yellow-500/70" />
            <div className="space-y-1">
              <p className="text-slate-400 font-medium">Como usar</p>
              {(activeCmd === 'docker_powershell' || activeCmd === 'docker_bash') && <p>Execute no terminal do servidor onde o agente vai rodar, dentro da pasta <code className="text-violet-300">agent/</code>. Requer Docker instalado.</p>}
              {(activeCmd === 'npm_powershell' || activeCmd === 'npm_bash') && <p>Execute dentro da pasta <code className="text-violet-300">agent/</code> do servidor com Node.js instalado. As variáveis de ambiente já estão no comando.</p>}
              {activeCmd === 'docker_compose' && <p>Salve como <code className="text-violet-300">docker-compose.yml</code> dentro da pasta <code className="text-violet-300">agent/</code> e execute <code className="text-violet-300">docker compose up -d</code>. O <code className="text-violet-300">host.docker.internal</code> aponta para o backend no host.</p>}
              <p className="text-slate-600">O token já está incorporado no comando — zero configuração manual no servidor.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<{ id: string; name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-agents'],
    queryFn: () => agentsApi.list(),
    refetchInterval: 10000,
  });
  const agents: any[] = data?.data?.agents || [];

  const create = useMutation({
    mutationFn: () => agentsApi.create(name.trim()),
    onSuccess: async (res) => {
      const agent = res.data.agent;
      const tokenRes = await agentsApi.getToken(agent.id);
      setNewToken({ id: agent.id, name: agent.name, token: tokenRes.data.token });
      setName('');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
    },
    onError: () => showToast('Erro ao criar agente', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => agentsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-agents'] }); showToast('Agente removido', 'info'); },
    onError: () => showToast('Erro ao remover agente', 'error'),
  });

  const checkStatus = async (id: string) => {
    setCheckingId(id);
    try {
      const res = await agentsApi.checkStatus(id);
      const { status, changed, message } = res.data;
      if (changed) showToast(message || `Agente marcado ${status}`, 'info');
      else showToast(`Agente está ${status}`, 'success');
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
    } catch {
      showToast('Erro ao verificar status', 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
          toast.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
          toast.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400" /> Gerenciar Agentes
          </h1>
          <p className="text-sm text-slate-400 mt-1">Cadastre, monitore e revogue tokens de agentes remotos</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" /> Novo Agente
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Registrar Novo Agente</h3>
          <p className="text-xs text-slate-400">Após criar, copie o token e configure-o no agente com <code className="text-violet-400">AGENT_TOKEN=...</code></p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Nome do agente (ex: agente-docker-01)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
              autoFocus
            />
            <button className="btn-primary flex items-center gap-2" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setName(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Token display */}
      {newToken && (
        <div className="card p-4 space-y-3 border-violet-500/40">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">Agente "{newToken.name}" criado com sucesso!</h3>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-xs" style={{ background: '#0d1117', border: '1px solid #2a3352' }}>
            <span className="flex-1 text-violet-300 break-all select-all">{newToken.token}</span>
            <button className="btn-ghost p-1.5 flex-shrink-0" onClick={() => copyToken(newToken.token)} title="Copiar">
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-start gap-2 text-xs text-yellow-400/80">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Guarde este token — ele não será exibido novamente. Configure o agente com: <code className="text-violet-300">AGENT_TOKEN={newToken.token}</code></span>
          </div>
          <button className="btn-ghost text-xs" onClick={() => setNewToken(null)}>Fechar</button>
        </div>
      )}

      {/* Agents list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : agents.length === 0 ? (
        <div className="card p-12 text-center">
          <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum agente cadastrado</p>
          <p className="text-sm text-slate-600 mt-1">Crie um agente para começar a executar testes remotamente</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="space-y-0">
              <div className="card p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    agent.status === 'online' ? 'bg-green-500/15' :
                    agent.status === 'busy' ? 'bg-yellow-500/15' : 'bg-slate-700/40'
                  }`}>
                    {agent.status === 'online'
                      ? <Wifi className="w-4 h-4 text-green-400" />
                      : agent.status === 'busy'
                      ? <Activity className="w-4 h-4 text-yellow-400" />
                      : <WifiOff className="w-4 h-4 text-slate-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{agent.name}</span>
                      <span className={`badge ${
                        agent.status === 'online' ? 'badge-online' :
                        agent.status === 'busy' ? 'badge-busy' : 'badge-offline'
                      }`}>
                        {agent.status === 'online' ? 'Online' : agent.status === 'busy' ? 'Executando' : 'Offline'}
                      </span>
                      {agent.deploy_config && (agent.deploy_config as any)?.backend_url && (
                        <span className="text-xs text-slate-600 font-mono">{(agent.deploy_config as any).backend_url}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span><span className="text-slate-600">ID:</span> {agent.id.slice(0, 8)}…</span>
                        <span><span className="text-slate-600">Heartbeat:</span> {agent.last_heartbeat ? `${formatDate(agent.last_heartbeat)} (${timeSince(agent.last_heartbeat)})` : 'nunca'}</span>
                        {agent.deploy_config && (agent.deploy_config as any)?.notes && (
                          <span className="text-slate-600 italic">{(agent.deploy_config as any).notes}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className={`p-2 rounded-lg transition-all ${
                        expandedId === agent.id
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'text-slate-400 hover:text-violet-400 hover:bg-violet-500/10'
                      }`}
                      title="Configurar agente"
                      onClick={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                      title="Verificar status"
                      disabled={checkingId === agent.id}
                      onClick={() => checkStatus(agent.id)}
                    >
                      {checkingId === agent.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Remover agente"
                      onClick={() => { if (confirm(`Remover agente "${agent.name}"? Esta ação é irreversível.`)) remove.mutate(agent.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {expandedId === agent.id && (
                <DeployPanel
                  agent={agent}
                  onClose={() => setExpandedId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="card p-4 border-violet-500/20">
        <div className="flex items-start gap-3">
          <KeyRound className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Fluxo de configuração</p>
            <p>1. Crie um agente com <span className="text-violet-300">Novo Agente</span></p>
            <p>2. Clique em <span className="text-violet-300">⚙ Configurar</span> no card do agente</p>
            <p>3. Preencha a URL do backend e clique em <span className="text-violet-300">Gerar Comando de Instalação</span></p>
            <p>4. Copie o comando gerado e execute no servidor onde o agente vai rodar</p>
            <p className="text-slate-500">O token é incorporado automaticamente no comando — zero configuração manual no servidor.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
