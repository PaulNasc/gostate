import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, RefreshCw, Copy, CheckCircle2, Loader2, Wifi, WifiOff, AlertTriangle, Settings2, Terminal, Activity, Cloud, Monitor, Server, Package, ChevronRight, ChevronLeft, Rocket, X, PlugZap } from 'lucide-react';
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

type DeployTarget = 'local' | 'aws-ec2' | 'vps' | 'docker-remote' | 'cloud-paas';

const DEPLOY_TARGETS: { id: DeployTarget; icon: React.ReactNode; title: string; subtitle: string }[] = [
  { id: 'local',         icon: <Monitor className="w-5 h-5" />,  title: 'Local / mesma máquina',      subtitle: 'Docker Desktop ou Node.js na própria máquina do backend' },
  { id: 'vps',           icon: <Server  className="w-5 h-5" />,  title: 'VPS / Servidor Dedicado',     subtitle: 'DigitalOcean, Hetzner, Linode, servidor próprio com SSH' },
  { id: 'aws-ec2',       icon: <Cloud   className="w-5 h-5" />,  title: 'AWS EC2 / GCP VM / Azure VM', subtitle: 'Instância de VM na nuvem com acesso SSH' },
  { id: 'docker-remote', icon: <Package className="w-5 h-5" />,  title: 'Docker remoto (outra máquina)', subtitle: 'Docker Engine acessível via SSH ou Docker Context' },
  { id: 'cloud-paas',    icon: <Rocket  className="w-5 h-5" />,  title: 'PaaS / Container-as-a-Service', subtitle: 'Railway, Render, Fly.io, Google Cloud Run' },
];

const SETUP_GUIDES: Record<DeployTarget, React.ReactNode> = {
  local: (
    <div className="space-y-2 text-xs">
      <p className="text-slate-300 font-semibold">Pré-requisitos</p>
      <ul className="space-y-1 text-slate-400 list-disc list-inside">
        <li>Docker Desktop instalado <span className="text-slate-600">(ou Node.js 18+)</span></li>
        <li>Repositório goState clonado na máquina</li>
      </ul>
      <p className="text-slate-300 font-semibold mt-3">Conectividade</p>
      <p className="text-slate-400">Use <code className="text-violet-300">http://host.docker.internal:4000</code> como BACKEND_URL — o Docker resolve automaticamente para o host.</p>
    </div>
  ),
  vps: (
    <div className="space-y-2 text-xs">
      <p className="text-slate-300 font-semibold">Pré-requisitos no servidor</p>
      <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-green-400"># Instalar Docker (Ubuntu/Debian)</p>
        <p className="text-slate-300">curl -fsSL https://get.docker.com | sh</p>
        <p className="text-slate-300">sudo usermod -aG docker $USER</p>
        <p className="text-green-400 mt-2"># Clonar o projeto</p>
        <p className="text-slate-300">git clone https://github.com/seu-org/gostate.git</p>
        <p className="text-slate-300">cd gostate/agent</p>
      </div>
      <p className="text-slate-300 font-semibold mt-3">Conectividade</p>
      <p className="text-slate-400">Configure <code className="text-violet-300">BACKEND_URL</code> com o IP público ou domínio do seu backend: <code className="text-violet-300">http://SEU_IP:4000</code></p>
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.15)' }}>
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-200/70">Certifique-se que a porta 4000 está aberta no firewall do servidor do backend (<code>ufw allow 4000</code>).</p>
      </div>
    </div>
  ),
  'aws-ec2': (
    <div className="space-y-2 text-xs">
      <p className="text-slate-300 font-semibold">1. Criar instância EC2</p>
      <ul className="space-y-1 text-slate-400 list-disc list-inside">
        <li>AMI recomendada: <span className="text-violet-300">Ubuntu Server 22.04 LTS</span></li>
        <li>Tipo mínimo: <span className="text-violet-300">t3.medium</span> (2 vCPU, 4 GB RAM)</li>
        <li>Para 3+ browsers paralelos: <span className="text-violet-300">t3.large ou superior</span></li>
        <li>Security Group: sem inbound necessário (agente apenas faz outbound)</li>
      </ul>
      <p className="text-slate-300 font-semibold mt-3">2. Instalar dependências via SSH</p>
      <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-green-400"># Conectar à instância</p>
        <p className="text-slate-300">ssh -i sua-chave.pem ubuntu@SEU_IP_EC2</p>
        <p className="text-green-400 mt-2"># Instalar Docker</p>
        <p className="text-slate-300">curl -fsSL https://get.docker.com | sh</p>
        <p className="text-slate-300">sudo usermod -aG docker ubuntu && newgrp docker</p>
        <p className="text-green-400 mt-2"># Clonar e rodar o agente</p>
        <p className="text-slate-300">git clone https://github.com/seu-org/gostate.git</p>
        <p className="text-slate-300">cd gostate/agent</p>
      </div>
      <p className="text-slate-300 font-semibold mt-3">3. Conectividade</p>
      <p className="text-slate-400">Use o IP/DNS público do backend no <code className="text-violet-300">BACKEND_URL</code>. Se o backend também está na AWS, use o IP privado para evitar custos de tráfego.</p>
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-emerald-300/70">Dica: use um Security Group de saída irrestrito. O agente só precisa de acesso de saída para o backend e para baixar browsers do Playwright.</p>
      </div>
    </div>
  ),
  'docker-remote': (
    <div className="space-y-2 text-xs">
      <p className="text-slate-300 font-semibold">Opção A — SSH direto para o host remoto</p>
      <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-green-400"># Copiar a pasta agent/ para o servidor remoto</p>
        <p className="text-slate-300">scp -r ./agent user@SERVIDOR_IP:~/gostate-agent</p>
        <p className="text-green-400 mt-2"># Conectar e subir o container</p>
        <p className="text-slate-300">ssh user@SERVIDOR_IP</p>
        <p className="text-slate-300">cd ~/gostate-agent</p>
        <p className="text-slate-300">docker compose up -d   # usa o docker-compose.yml gerado</p>
      </div>
      <p className="text-slate-300 font-semibold mt-3">Opção B — Docker Context (sem SSH manual)</p>
      <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-green-400"># Criar context apontando para o host remoto</p>
        <p className="text-slate-300">docker context create remoto --docker "host=ssh://user@SERVIDOR_IP"</p>
        <p className="text-slate-300">docker context use remoto</p>
        <p className="text-green-400 mt-2"># Subir a partir da máquina local</p>
        <p className="text-slate-300">cd agent && docker compose up -d</p>
        <p className="text-slate-300">docker context use default  # voltar ao contexto local</p>
      </div>
    </div>
  ),
  'cloud-paas': (
    <div className="space-y-2 text-xs">
      <p className="text-slate-300 font-semibold">Railway / Render / Fly.io</p>
      <ul className="space-y-1 text-slate-400 list-disc list-inside">
        <li>Aponte o serviço para a pasta <code className="text-violet-300">agent/</code> do repositório</li>
        <li>O Dockerfile já está configurado — sem configuração extra</li>
        <li>Defina as variáveis de ambiente no painel do serviço:</li>
      </ul>
      <div className="rounded-lg p-3 font-mono space-y-1 mt-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-slate-300">AGENT_TOKEN=<span className="text-violet-300">[token gerado]</span></p>
        <p className="text-slate-300">BACKEND_URL=<span className="text-violet-300">https://seu-backend.railway.app</span></p>
        <p className="text-slate-300">NODE_ENV=production</p>
        <p className="text-slate-300">AGENT_MAX_CONCURRENT=2</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-2" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.15)' }}>
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-yellow-200/70"><strong>Atenção:</strong> PaaS gratuitos podem ter cold starts ou limites de RAM. Playwright com Chromium precisa de <strong>mínimo 1 GB RAM</strong>. Planos free podem não ser suficientes.</p>
      </div>
      <p className="text-slate-300 font-semibold mt-3">Google Cloud Run</p>
      <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
        <p className="text-green-400"># Build e push da imagem</p>
        <p className="text-slate-300">cd agent</p>
        <p className="text-slate-300">gcloud builds submit --tag gcr.io/SEU_PROJETO/gostate-agent</p>
        <p className="text-green-400 mt-2"># Deploy com variáveis de ambiente</p>
        <p className="text-slate-300">gcloud run deploy gostate-agent \</p>
        <p className="text-slate-300">  --image gcr.io/SEU_PROJETO/gostate-agent \</p>
        <p className="text-slate-300">  --set-env-vars AGENT_TOKEN=TOKEN,BACKEND_URL=URL \</p>
        <p className="text-slate-300">  --memory 2Gi --no-allow-unauthenticated</p>
      </div>
    </div>
  ),
};

function DeployWizard({ agent, token, onClose }: { agent: any; token: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [target, setTarget] = useState<DeployTarget | null>(null);
  const [env, setEnv] = useState<EnvType | null>(null);
  const [backendUrl, setBackendUrl] = useState('http://host.docker.internal:4000');
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
      await agentsApi.saveDeployConfig(agent.id, { backend_url: backendUrl, docker_image: 'node:20-slim', node_env: 'production', extra_env: '', notes: target || '' });
      const res = await agentsApi.getInstallCommand(agent.id);
      setCommands(res.data.commands);
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setStep(4);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // Auto-suggest backend URL based on target
  const handleTargetSelect = (t: DeployTarget) => {
    setTarget(t);
    if (t === 'local') setBackendUrl('http://host.docker.internal:4000');
    else setBackendUrl('http://SEU_IP_OU_DOMINIO:4000');
  };

  const selectedEnv = ENV_OPTIONS.find(e => e.id === env);
  const currentCmd = commands && selectedEnv ? commands[selectedEnv.cmd] : '';
  const isCompose = env === 'compose';
  const TOTAL_STEPS = 4;

  const STEP_LABELS = ['Token', 'Onde rodar', 'Comando', 'Verificar'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0d1117', border: '1px solid #2a3352', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1e2a3a' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.2)' }}>
              <Rocket className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Conectar Agente: <span className="text-violet-300">{agent.name}</span></p>
              <p className="text-xs text-slate-500">{STEP_LABELS[step - 1]} · Passo {step} de {TOTAL_STEPS}</p>
            </div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 gap-1 border-b" style={{ borderColor: '#1e2a3a' }}>
          {STEP_LABELS.map((label, i) => {
            const s = i + 1;
            const active = step === s;
            const done = step > s;
            return (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-violet-300' : done ? 'text-green-400' : 'text-slate-600'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${active ? 'bg-violet-500/30 text-violet-300' : done ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-600'}`}>
                    {done ? '✓' : s}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: done ? '#22c55e40' : '#1e2a3a' }} />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Step 1: Token */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Token do agente</h2>
                <p className="text-xs text-slate-400">Guarde este token — ele autentica o agente com o backend. Não será exibido novamente após fechar.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 font-mono text-xs" style={{ background: '#0a0d14', border: '1px solid #2a3352' }}>
                <span className="flex-1 text-violet-300 break-all select-all">{token}</span>
                <button className="flex-shrink-0 p-1.5 rounded hover:bg-white/10 transition-colors" onClick={() => copy(token, setTokenCopied)} title="Copiar token">
                  {tokenCopied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span className="text-yellow-200/70">Copie o token agora e guarde em local seguro (ex: secrets do seu CI/CD ou .env do servidor).</span>
              </div>
              <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: '#0a0f1a', border: '1px solid #1e2a3a' }}>
                <p className="text-slate-300 font-semibold">Como este token é usado</p>
                <p className="text-slate-500">O agente usa o valor de <code className="text-violet-300">AGENT_TOKEN</code> para autenticar via WebSocket no backend. Sem esse token, o agente não consegue receber execuções.</p>
              </div>
            </div>
          )}

          {/* Step 2: Target + setup guide + backend URL */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Onde vai rodar o agente?</h2>
                <p className="text-xs text-slate-400">Selecione o ambiente para ver o guia de configuração específico.</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {DEPLOY_TARGETS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleTargetSelect(opt.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{ border: `1px solid ${target === opt.id ? 'rgba(124,58,237,0.6)' : '#2a3352'}`, background: target === opt.id ? 'rgba(124,58,237,0.08)' : 'transparent' }}
                  >
                    <span className={target === opt.id ? 'text-violet-400' : 'text-slate-500'}>{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${target === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</p>
                    </div>
                    {target === opt.id && <CheckCircle2 className="w-4 h-4 text-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>

              {target && (
                <div className="rounded-xl p-4" style={{ background: '#0a0f1a', border: '1px solid #1e2a3a' }}>
                  {SETUP_GUIDES[target]}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Command type + backend URL */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Método de execução</h2>
                <p className="text-xs text-slate-400">Escolha como o agente será executado no servidor.</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {ENV_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setEnv(opt.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{ border: `1px solid ${env === opt.id ? 'rgba(124,58,237,0.6)' : '#2a3352'}`, background: env === opt.id ? 'rgba(124,58,237,0.08)' : 'transparent' }}
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
                  URL do Backend <span className="text-slate-600">(onde o agente vai conectar)</span>
                </label>
                <input
                  className="input w-full"
                  placeholder="http://192.168.1.10:4000  ou  https://meu-backend.railway.app"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                />
                {target === 'local' && <p className="text-xs text-slate-600 mt-1">✓ <code className="text-violet-400">host.docker.internal</code> resolve automaticamente para o host no Docker</p>}
                {target !== 'local' && <p className="text-xs text-slate-600 mt-1">Use o IP público ou domínio do servidor onde o backend está rodando</p>}
              </div>
            </div>
          )}

          {/* Step 4: Command + next steps */}
          {step === 4 && commands && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Execute no servidor</h2>
                <p className="text-xs text-slate-400">
                  {isCompose
                    ? 'Salve como docker-compose.yml na pasta agent/ e execute docker compose up -d'
                    : 'Copie o comando e execute no terminal do servidor, dentro da pasta agent/'}
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
                <pre className="p-4 text-xs text-violet-200 font-mono overflow-x-auto whitespace-pre leading-relaxed" style={{ maxHeight: '200px' }}>{currentCmd}</pre>
              </div>

              <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: '#0a0f1a', border: '1px solid #1e2a3a' }}>
                <p className="text-slate-300 font-semibold">Checklist de verificação</p>
                <div className="space-y-1.5 text-slate-400">
                  <p>☐ Execute o comando na pasta <code className="text-violet-300">agent/</code> do projeto</p>
                  <p>☐ Aguarde o build da imagem Docker (~3–5 min na primeira vez)</p>
                  <p>☐ Verifique os logs: <code className="text-violet-300">docker logs -f nome-do-container</code></p>
                  <p>☐ O agente deve aparecer como <span className="text-green-400 font-semibold">Online</span> nesta página em até 30 segundos</p>
                  {target === 'aws-ec2' && <p>☐ Confirme que o Security Group do backend permite tráfego de entrada na porta 4000</p>}
                  {target === 'vps' && <p>☐ Verifique se o firewall libera a porta 4000: <code className="text-violet-300">ufw allow 4000</code></p>}
                  {target === 'cloud-paas' && <p>☐ Confirme que o serviço não tem restrição de saída de rede (outbound)</p>}
                </div>
              </div>

              <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <p className="text-emerald-300 font-semibold">Diagnóstico de problemas</p>
                <div className="space-y-1.5 text-slate-400">
                  <p><span className="text-yellow-400">Agente não fica Online:</span> verifique AGENT_TOKEN e BACKEND_URL nos logs</p>
                  <p><span className="text-yellow-400">Connection refused:</span> confirme que o backend está rodando e acessível na URL configurada</p>
                  <p><span className="text-yellow-400">Browser não instala:</span> verifique espaço em disco (mínimo 2 GB livres) e acesso à internet do container</p>
                  <p><span className="text-yellow-400">Out of memory:</span> aumente RAM do servidor ou reduza AGENT_MAX_CONCURRENT</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: '#1e2a3a' }}>
          <div>
            {step > 1 && (
              <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3 | 4)}>
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 4 && (
              <button className="btn-ghost text-xs text-slate-500 hover:text-slate-300" onClick={onClose}>Fechar</button>
            )}
            {step === 1 && (
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setStep(2)}>
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <button className="btn-primary flex items-center gap-2 text-sm" disabled={!target} onClick={() => setStep(3)}>
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                disabled={!env || loading}
                onClick={generate}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                Gerar Comando
              </button>
            )}
            {step === 4 && (
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
  const [wizardLoadingId, setWizardLoadingId] = useState<string | null>(null);
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

  const openWizard = async (agent: any) => {
    setWizardLoadingId(agent.id);
    try {
      const res = await agentsApi.getToken(agent.id);
      setWizard({ agent, token: res.data.token });
    } catch {
      showToast('Erro ao buscar token do agente', 'error');
    } finally {
      setWizardLoadingId(null);
    }
  };

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

  const STATUS_CFG = {
    online:  { label: 'Online',     dot: 'bg-green-400',  ping: 'bg-green-400',  iconCls: 'text-green-400',  iconBg: 'rgba(34,197,94,0.15)',   border: '#22c55e45' },
    busy:    { label: 'Executando', dot: 'bg-yellow-400', ping: 'bg-yellow-400', iconCls: 'text-yellow-400', iconBg: 'rgba(234,179,8,0.15)',   border: '#eab30845' },
    offline: { label: 'Offline',    dot: 'bg-slate-600',  ping: '',              iconCls: 'text-slate-500',  iconBg: 'rgba(100,116,139,0.15)', border: '#47556945' },
  } as const;

  const CARD_H = '220px';

  return (
    <div className="p-6 space-y-6 w-full">
      {wizard && (
        <DeployWizard agent={wizard.agent} token={wizard.token} onClose={() => setWizard(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
          toast.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
          toast.type === 'error'   ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400" /> Gerenciar Agentes
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {agents.filter(a => a.status === 'online').length} online ·{' '}
            {agents.filter(a => a.status === 'busy').length} executando ·{' '}
            {agents.filter(a => a.status === 'offline').length} offline
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" /> Novo Agente
        </button>
      </div>

      {/* New agent form */}
      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Registrar Novo Agente</h3>
          <p className="text-xs text-slate-400">Após criar, um wizard vai guiar a instalação no servidor remoto.</p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Nome do agente (ex: agente-docker-01)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && create.mutate()}
              autoFocus
            />
            <button className="btn-primary flex items-center gap-2" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setName(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Agents grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : agents.length === 0 ? (
        <div className="card p-12 text-center">
          <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum agente cadastrado</p>
          <p className="text-sm text-slate-600 mt-1">Crie um agente para começar a executar testes remotamente</p>
        </div>
      ) : (
        <>
          <style>{`
            .adm-agent-flip { perspective: 1000px; }
            .adm-agent-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
            .adm-agent-flip:not(.is-expanded):hover .adm-agent-flip-inner { transform: rotateY(180deg); }
            .adm-agent-flip.is-expanded .adm-agent-flip-inner { transform: rotateY(180deg); }
            .adm-agent-front, .adm-agent-back { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 0.75rem; }
            .adm-agent-back { transform: rotateY(180deg); }
          `}</style>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {agents.map(agent => {
              const cfg = STATUS_CFG[agent.status as keyof typeof STATUS_CFG] || STATUS_CFG.offline;
              const dc  = typeof agent.deploy_config === 'string' ? JSON.parse(agent.deploy_config || '{}') : (agent.deploy_config || {});
              const caps = agent.capabilities || {};
              const browsers: string[]   = caps.browsers   || [];
              const frameworks: string[] = caps.frameworks || [];
              const isExpanded = expandedId === agent.id;

              return (
                <div key={agent.id} className="space-y-2">
                  <div
                    className={`adm-agent-flip ${isExpanded ? 'is-expanded' : ''}`}
                    style={{ height: CARD_H, minHeight: CARD_H }}
                  >
                    <div className="adm-agent-flip-inner" style={{ height: CARD_H }}>

                      {/* ── FRENTE ── */}
                      <div
                        className="adm-agent-front flex flex-col items-center justify-center gap-3 p-5"
                        style={{ background: '#0d1117', border: `1px solid ${cfg.border}` }}
                      >
                        {/* Pulsing status dot */}
                        <div className="absolute top-3 right-3">
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
                            ? <Activity className={`w-7 h-7 ${cfg.iconCls}`} />
                            : agent.status === 'online'
                              ? <Wifi className={`w-7 h-7 ${cfg.iconCls}`} />
                              : <WifiOff className={`w-7 h-7 ${cfg.iconCls}`} />
                          }
                        </div>

                        {/* Status tag */}
                        <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${cfg.iconCls}`}
                          style={{ background: cfg.iconBg, borderColor: cfg.border }}>
                          {cfg.label}
                        </span>

                        {/* Name */}
                        <p className="text-sm font-bold text-center leading-tight text-white">
                          {agent.name}
                        </p>

                        <p className="text-xs text-slate-600">Passe o mouse para opções</p>
                      </div>

                      {/* ── VERSO ── */}
                      <div
                        className="adm-agent-back flex flex-col p-4"
                        style={{ background: '#0d1117', border: `1px solid ${cfg.border}` }}
                      >
                        {/* Back header */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: cfg.iconBg }}>
                            <Bot className={`w-4 h-4 ${cfg.iconCls}`} />
                          </div>
                          <span className="text-xs font-bold text-white truncate flex-1">{agent.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${cfg.iconCls}`}
                            style={{ background: cfg.iconBg, borderColor: cfg.border }}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Heartbeat */}
                        <p className="text-xs text-slate-500 mb-1 truncate">
                          {agent.last_heartbeat
                            ? `${timeSince(agent.last_heartbeat)} · ${formatDate(agent.last_heartbeat)}`
                            : 'Nunca conectado'}
                        </p>

                        {/* Backend URL / notes */}
                        {(dc.backend_url || dc.notes) && (
                          <p className="text-xs text-slate-600 font-mono mb-2 truncate">{dc.backend_url || dc.notes}</p>
                        )}

                        {/* Capabilities */}
                        <div className="flex flex-wrap gap-1 mb-auto">
                          {browsers.map((b: string) => (
                            <span key={b} className="text-xs px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">{b}</span>
                          ))}
                          {frameworks.map((f: string) => (
                            <span key={f} className="text-xs px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">{f}</span>
                          ))}
                          {caps.max_concurrent && (
                            <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                              max {caps.max_concurrent}x
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 pt-2 mt-2 border-t border-slate-800">
                          <button
                            className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-all"
                            title="Wizard de instalação"
                            disabled={wizardLoadingId === agent.id}
                            onClick={() => openWizard(agent)}
                          >
                            {wizardLoadingId === agent.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                            <span>Conectar</span>
                          </button>
                          <button
                            className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-all ${isExpanded ? 'text-violet-300 bg-violet-500/15' : 'text-slate-400 hover:text-violet-400 hover:bg-violet-500/10'}`}
                            title="Configurar"
                            onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                            <span>Config</span>
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                            title="Verificar status"
                            disabled={checkingId === agent.id}
                            onClick={() => checkStatus(agent.id)}
                          >
                            {checkingId === agent.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Remover"
                            onClick={() => { if (confirm(`Remover agente "${agent.name}"?`)) remove.mutate(agent.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Deploy panel expands below the card */}
                  {isExpanded && (
                    <DeployPanel agent={agent} onClose={() => setExpandedId(null)} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}
