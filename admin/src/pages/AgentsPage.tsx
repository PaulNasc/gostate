import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, RefreshCw, Copy, CheckCircle2, Loader2, Wifi, WifiOff, KeyRound, AlertTriangle, Settings2, Terminal, Activity, Cloud, Monitor, Server, Package, ChevronRight, ChevronLeft, Rocket, X } from 'lucide-react';
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

type EnvType = 'docker-linux' | 'docker-windows' | 'npm-linux' | 'npm-windows' | 'compose';

const ENV_OPTIONS: { id: EnvType; icon: React.ReactNode; title: string; subtitle: string; cmd: keyof InstallCommands }[] = [
  { id: 'docker-linux',   icon: <Server  className="w-5 h-5" />, title: 'Docker — Linux / VPS / Cloud', subtitle: 'Ubuntu, Debian, EC2, DigitalOcean, Railway, Render…', cmd: 'docker_bash' },
  { id: 'docker-windows', icon: <Monitor className="w-5 h-5" />, title: 'Docker — Windows',              subtitle: 'Docker Desktop no Windows + PowerShell',          cmd: 'docker_powershell' },
  { id: 'compose',        icon: <Package className="w-5 h-5" />, title: 'Docker Compose',                subtitle: 'Salve como docker-compose.yml e rode up -d',     cmd: 'docker_compose' },
  { id: 'npm-linux',      icon: <Terminal className="w-5 h-5" />, title: 'NPM direto — Linux / Mac',      subtitle: 'Node.js já instalado, sem Docker',               cmd: 'npm_bash' },
  { id: 'npm-windows',    icon: <Terminal className="w-5 h-5" />, title: 'NPM direto — Windows',          subtitle: 'Node.js já instalado, PowerShell',               cmd: 'npm_powershell' },
];

function DeployWizard({ agent, token, onClose }: { agent: any; token: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [env, setEnv] = useState<EnvType | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [commands, setCommands] = useState<InstallCommands | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => { setter(true); setTimeout(() => setter(false), 2000); });
  };

  const generate = async () => {
    if (!env) return;
    setLoading(true);
    try {
      await agentsApi.saveDeployConfig(agent.id, { backend_url: backendUrl, docker_image: 'node:20-slim', node_env: 'production', extra_env: '', notes: '' });
      const res = await agentsApi.getInstallCommand(agent.id);
      setCommands(res.data.commands);
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setStep(3);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const selectedEnv = ENV_OPTIONS.find(e => e.id === env);
  const currentCmd = commands && selectedEnv ? commands[selectedEnv.cmd] : '';
  const isCompose = env === 'compose';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0d1117', border: '1px solid #2a3352', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e2a3a' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.2)' }}>
              <Rocket className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Conectar Agente: <span className="text-violet-300">{agent.name}</span></p>
              <p className="text-xs text-slate-500">Passo {step} de 3</p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5" style={{ background: '#1e2a3a' }}>
          <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Step 1: Token */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">1. Token do agente</h2>
                <p className="text-xs text-slate-400">Guarde este token — ele autentica o agente com o backend. Não será exibido novamente.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 font-mono text-xs" style={{ background: '#0a0d14', border: '1px solid #2a3352' }}>
                <span className="flex-1 text-violet-300 break-all select-all">{token}</span>
                <button className="flex-shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors" onClick={() => copy(token, setTokenCopied)} title="Copiar token">
                  {tokenCopied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span className="text-yellow-200/70">Copie o token agora. Após fechar este wizard, você não poderá vê-lo novamente.</span>
              </div>
            </div>
          )}

          {/* Step 2: Environment + backend URL */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">2. Onde vai rodar o agente?</h2>
                <p className="text-xs text-slate-400">Escolha o ambiente de execução. O comando de instalação será gerado automaticamente.</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {ENV_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setEnv(opt.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      env === opt.id
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : 'border-slate-700/60 hover:border-slate-600'
                    }`}
                    style={{ border: '1px solid' }}
                  >
                    <span className={env === opt.id ? 'text-violet-400' : 'text-slate-500'}>{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${env === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</p>
                    </div>
                    {env === opt.id && <CheckCircle2 className="w-4 h-4 text-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  URL do Backend <span className="text-slate-600">(onde o agente vai enviar os resultados)</span>
                </label>
                <input
                  className="input w-full"
                  placeholder="http://192.168.1.10:4000  ou  https://meu-backend.railway.app"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                />
                <p className="text-xs text-slate-600 mt-1">Deixe em branco para usar <code className="text-violet-400">http://localhost:4000</code> (apenas para agentes locais)</p>
              </div>
            </div>
          )}

          {/* Step 3: Command */}
          {step === 3 && commands && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">3. Execute no servidor</h2>
                <p className="text-xs text-slate-400">
                  Copie o comando abaixo e execute {isCompose ? 'salve como <code>docker-compose.yml</code> na pasta <code>agent/</code>' : 'no terminal do servidor'}, dentro da pasta <code className="text-violet-300">agent/</code> do projeto goState.
                </p>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ background: '#020409', border: '1px solid #2a3352' }}>
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#1e2a3a' }}>
                  <span className="text-xs text-slate-500 font-mono">{selectedEnv?.title}</span>
                  <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors" onClick={() => copy(currentCmd, setCopied)}>
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <pre className="p-4 text-xs text-violet-200 font-mono overflow-x-auto whitespace-pre leading-relaxed" style={{ maxHeight: '220px' }}>{currentCmd}</pre>
              </div>

              <div className="space-y-2 text-xs text-slate-400 rounded-xl p-4" style={{ background: '#0a0f1a', border: '1px solid #1e2a3a' }}>
                <p className="font-semibold text-slate-300">Próximos passos</p>
                {!isCompose && (
                  <p>1. Certifique-se que <span className="text-violet-300">{env?.startsWith('docker') ? 'Docker' : 'Node.js 18+'}</span> está instalado no servidor</p>
                )}
                {isCompose && <p>1. Salve o conteúdo como <code className="text-violet-300">docker-compose.yml</code> na pasta <code className="text-violet-300">agent/</code></p>}
                <p>{isCompose ? '2' : '2'}. Execute o comando na pasta <code className="text-violet-300">agent/</code> do projeto</p>
                <p>{isCompose ? '3' : '3'}. O agente vai aparecer como <span className="text-green-400">Online</span> em alguns segundos</p>
                <p className="text-slate-600">O token já está incorporado no comando — zero configuração manual.</p>
              </div>

              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Cloud className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-emerald-300/80">Para ambientes cloud (Railway, Render, Fly.io): use a opção Docker Linux e defina a URL do backend como a URL pública do seu backend goState.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: '#1e2a3a' }}>
          <div>
            {step > 1 && (
              <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 3 && (
              <button
                className="btn-ghost text-xs text-slate-500 hover:text-slate-300"
                onClick={onClose}
              >Fechar sem configurar</button>
            )}
            {step === 1 && (
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setStep(2)}>
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <button
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                disabled={!env || loading}
                onClick={generate}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                Gerar Comando
              </button>
            )}
            {step === 3 && (
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={onClose}>
                <CheckCircle2 className="w-4 h-4" /> Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [wizard, setWizard] = useState<{ agent: any; token: string } | null>(null);
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
      setWizard({ agent, token: tokenRes.data.token });
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

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {wizard && (
        <DeployWizard
          agent={wizard.agent}
          token={wizard.token}
          onClose={() => setWizard(null)}
        />
      )}
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
          <p className="text-xs text-slate-400">Após criar, um wizard vai guiar a instalação no servidor remoto.</p>
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
            <p>1. Clique em <span className="text-violet-300">Novo Agente</span> — um wizard abre automaticamente</p>
            <p>2. Copie o token, escolha o ambiente (Docker, NPM, VPS, Cloud) e informe a URL do backend</p>
            <p>3. Copie o comando gerado e execute na pasta <code className="text-violet-300">agent/</code> do servidor</p>
            <p>4. O agente aparece como <span className="text-green-400">Online</span> em segundos após executar</p>
            <p className="text-slate-500">Para reconfigurar um agente existente, clique em <span className="text-violet-300">⚙ Configurar</span> no card.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
