import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi, projectsApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Plus, Trash2, Loader2, Webhook, CheckCircle2, AlertCircle, Send,
  Play, XCircle, Zap, Bell, ChevronDown, ChevronUp, ExternalLink, Copy, Check,
  Pencil, FileText, List, Paperclip, Globe, FolderOpen, X, Mail, Eye, EyeOff,
} from 'lucide-react';
import { useToast } from '../components/Toast';

function getErrorMessage(error: any): string {
  const data = error?.response?.data;
  if (!data) return error?.message || 'Erro inesperado';
  if (typeof data.error === 'string') return data.error;
  const fieldErrors = data?.details?.fieldErrors || data?.error?.fieldErrors;
  const formErrors = data?.details?.formErrors || data?.error?.formErrors;
  const messages: string[] = [];
  if (Array.isArray(formErrors)) {
    messages.push(...formErrors.filter((msg: any) => typeof msg === 'string' && msg.trim()));
  }
  if (fieldErrors && typeof fieldErrors === 'object') {
    Object.values(fieldErrors).forEach((value: any) => {
      if (Array.isArray(value)) {
        messages.push(...value.filter((msg: any) => typeof msg === 'string' && msg.trim()));
      }
    });
  }
  if (messages.length > 0) return messages.join(' ');
  return error?.message || 'Erro inesperado';
}

const TYPES = [
  {
    value: 'discord', label: 'Discord',
    color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20',
    urlPlaceholder: 'https://discord.com/api/webhooks/ID/TOKEN',
    docUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
    steps: [
      'Abra o Discord e vá até o canal desejado.',
      'Clique em "Editar Canal" → "Integrações" → "Webhooks".',
      'Clique em "Criar Webhook", defina nome e avatar.',
      'Copie a "URL do Webhook" gerada.',
      'Cole a URL no campo abaixo e defina os eventos a notificar.',
    ],
  },
  {
    value: 'slack', label: 'Slack',
    color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20',
    urlPlaceholder: 'https://hooks.slack.com/services/T.../B.../...',
    docUrl: 'https://api.slack.com/messaging/webhooks',
    steps: [
      'Acesse api.slack.com/apps e clique em "Create New App".',
      'Escolha "From scratch", dê um nome e selecione o workspace.',
      'Em "Features", ative "Incoming Webhooks".',
      'Clique em "Add New Webhook to Workspace" e selecione o canal.',
      'Copie a "Webhook URL" gerada e cole no campo abaixo.',
    ],
  },
  {
    value: 'mattermost', label: 'Mattermost',
    color: 'text-blue-300', bg: 'bg-blue-400/10 border-blue-400/20',
    urlPlaceholder: 'https://mattermost.empresa.com/hooks/TOKEN',
    docUrl: 'https://docs.mattermost.com/developer/webhooks-incoming.html',
    steps: [
      'No Mattermost, vá em Menu → Integrações → Incoming Webhooks.',
      'Clique em "Add Incoming Webhook" e selecione o canal.',
      'Defina um título e salve.',
      'Copie a URL gerada e cole no campo abaixo.',
    ],
  },
  {
    value: 'teams', label: 'Microsoft Teams',
    color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20',
    urlPlaceholder: 'https://outlook.office.com/webhook/...',
    docUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
    steps: [
      'No Teams, vá até o canal onde quer receber notificações.',
      'Clique em "..." → "Conectores".',
      'Pesquise por "Incoming Webhook" e clique em "Configurar".',
      'Defina um nome e opcionalmente uma imagem.',
      'Copie a URL gerada e cole no campo abaixo.',
    ],
  },
  {
    value: 'telegram', label: 'Telegram',
    color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20',
    urlPlaceholder: 'https://api.telegram.org/botTOKEN/sendMessage?chat_id=ID',
    docUrl: 'https://core.telegram.org/bots/api',
    steps: [
      'Abra o Telegram e converse com @BotFather.',
      'Use o comando /newbot e siga as instruções para criar seu bot.',
      'Copie o token do bot gerado.',
      'Adicione o bot ao grupo/canal desejado e obtenha o chat_id.',
      'Monte a URL: https://api.telegram.org/botSEU_TOKEN/sendMessage?chat_id=SEU_CHAT_ID',
    ],
  },
  {
    value: 'pagerduty', label: 'PagerDuty',
    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20',
    urlPlaceholder: 'https://events.pagerduty.com/v2/enqueue',
    docUrl: 'https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTgw-send-an-alert-event',
    steps: [
      'No PagerDuty, vá em "Services" → "Service Directory".',
      'Selecione ou crie um serviço, depois vá em "Integrations".',
      'Adicione uma integração do tipo "Events API v2".',
      'Copie a "Integration Key" gerada.',
      'Use a URL: https://events.pagerduty.com/v2/enqueue',
    ],
  },
  {
    value: 'opsgenie', label: 'Opsgenie',
    color: 'text-orange-300', bg: 'bg-orange-400/10 border-orange-400/20',
    urlPlaceholder: 'https://api.opsgenie.com/v2/alerts',
    docUrl: 'https://docs.opsgenie.com/docs/alert-api',
    steps: [
      'No Opsgenie, acesse Settings → API key management.',
      'Crie ou copie uma API key existente.',
      'Use a URL: https://api.opsgenie.com/v2/alerts',
      'Adicione o header Authorization: GenieKey SEU_TOKEN via webhook genérico, ou configure diretamente.',
    ],
  },
  {
    value: 'datadog', label: 'Datadog',
    color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20',
    urlPlaceholder: 'https://api.datadoghq.com/api/v1/events',
    docUrl: 'https://docs.datadoghq.com/api/latest/events/',
    steps: [
      'No Datadog, acesse Organization Settings → API Keys.',
      'Crie uma nova API key.',
      'Use a URL: https://api.datadoghq.com/api/v1/events?api_key=SEU_TOKEN',
      'Cole a URL completa com a API key no campo abaixo.',
    ],
  },
  {
    value: 'grafana', label: 'Grafana',
    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
    urlPlaceholder: 'https://grafana.empresa.com/api/alerts/webhook',
    docUrl: 'https://grafana.com/docs/grafana/latest/alerting/manage-notifications/webhook-notifier/',
    steps: [
      'No Grafana, acesse Alerting → Notification channels.',
      'Crie um novo canal do tipo "Webhook".',
      'Configure a URL de callback do seu Grafana.',
      'Copie a URL do webhook e cole no campo abaixo.',
    ],
  },
  {
    value: 'linear', label: 'Linear',
    color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20',
    urlPlaceholder: '',
    docUrl: 'https://linear.app/docs/webhooks',
    steps: [
      'No Linear, acesse Settings → API → Personal API keys.',
      'Crie uma nova API key.',
      'O goState criará issues automaticamente quando testes falharem.',
      'Defina o Team ID e o label no campo de configuração.',
    ],
  },
  {
    value: 'webhook', label: 'Webhook Genérico',
    color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20',
    urlPlaceholder: 'https://seu-servidor.com/webhook',
    docUrl: '',
    steps: [
      'Configure um endpoint HTTP POST no seu servidor.',
      'O goState enviará um JSON com: event, execution_id, status, title, project, duration_ms, timestamp.',
      'Campos opcionais: environment, browsers, agent, retry_count, flaky, error_summary, report, steps, artifacts.',
      'Responda com status 2xx para confirmar recebimento.',
      'Cole a URL do seu endpoint no campo abaixo.',
    ],
  },
  {
    value: 'smtp', label: 'E-mail (SMTP)',
    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
    urlPlaceholder: '',
    docUrl: '',
    steps: [
      'Informe o host SMTP do seu provedor (ex: smtp.gmail.com, smtp.sendgrid.net).',
      'Use a porta 587 (TLS) ou 465 (SSL). Para Gmail, use 587 com TLS.',
      'Para Gmail: ative "Acesso a app menos seguro" ou use uma Senha de App.',
      'Preencha o e-mail remetente (from) e destinatário(s) (to).',
      'Os e-mails serão enviados em HTML com detalhes da execução.',
    ],
  },
];

const EVENT_GROUPS = [
  {
    group: 'Execução',
    events: [
      { value: 'execution.passed',   label: 'Passou',         icon: CheckCircle2, activeBg: 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400' },
      { value: 'execution.failed',   label: 'Falhou',         icon: XCircle,      activeBg: 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400' },
      { value: 'execution.error',    label: 'Erro',           icon: AlertCircle,  activeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400' },
      { value: 'execution.started',  label: 'Iniciada',       icon: Play,         activeBg: 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400' },
      { value: 'execution.queued',   label: 'Na fila',        icon: Zap,          activeBg: 'bg-slate-500/15 border-slate-500/40 text-slate-400' },
      { value: 'execution.retried',  label: 'Retry',          icon: Play,         activeBg: 'bg-violet-500/15 border-violet-500/40 text-violet-400' },
      { value: 'execution.flaky',    label: 'Flaky',          icon: AlertCircle,  activeBg: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-500' },
    ],
  },
  {
    group: 'Plano de Testes',
    events: [
      { value: 'plan.started',  label: 'Plano iniciado',   icon: Play,          activeBg: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400' },
      { value: 'plan.finished', label: 'Plano concluído',  icon: CheckCircle2,  activeBg: 'bg-teal-500/15 border-teal-500/40 text-teal-400' },
    ],
  },
  {
    group: 'Agendamentos',
    events: [
      { value: 'schedule.triggered', label: 'Agendamento disparado', icon: Bell, activeBg: 'bg-orange-500/15 border-orange-500/40 text-orange-400' },
    ],
  },
];

const EVENTS = EVENT_GROUPS.flatMap(g => g.events);

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="p-1 rounded transition-colors flex-shrink-0"
      style={{ color: copied ? '#10b981' : 'var(--text-muted)' }}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

const INCLUDE_FLAGS_OPTIONS = [
  {
    key: 'detailed_report',
    icon: FileText,
    label: 'Relatório detalhado',
    description: 'Total de steps, quantos passaram/falharam/pularam + taxa de sucesso',
  },
  {
    key: 'steps',
    icon: List,
    label: 'Lista de steps',
    description: 'Cada step com status, duração e erro (colapsível no Discord/Slack)',
  },
  {
    key: 'error_summary',
    icon: AlertCircle,
    label: 'Resumo do erro',
    description: 'Mensagem do primeiro step falho ou erro de execução',
  },
  {
    key: 'environment_info',
    icon: Globe,
    label: 'Info de ambiente',
    description: 'Nome do ambiente de variáveis usado na execução',
  },
  {
    key: 'browser_info',
    icon: Eye,
    label: 'Info de browser',
    description: 'Qual(is) browser(s) foram usados na execução',
  },
  {
    key: 'retry_info',
    icon: Play,
    label: 'Info de retry',
    description: 'Número de tentativas quando a execução usou retry automático',
  },
  {
    key: 'flaky_detection',
    icon: Zap,
    label: 'Detecção de flaky',
    description: 'Indica se a execução foi marcada como instável (passou e falhou em retries)',
  },
  {
    key: 'artifacts',
    icon: Paperclip,
    label: 'Artefatos',
    description: 'Links dos arquivos gerados (vídeos, screenshots) — com URL quando disponível',
  },
];

const EMPTY_FLAGS = { detailed_report: false, steps: false, artifacts: false, environment_info: false, browser_info: false, error_summary: false, retry_info: false, flaky_detection: false };
const EMPTY_SMTP = { host: '', port: 587, secure: false, user: '', pass: '', from: '', to: '', subject_prefix: '[goState]' };
const EMPTY_FORM = { type: 'discord', label: '', webhook_url: '', events: ['execution.failed'] as string[], enabled: true, project_id: '' as string | null, include_flags: EMPTY_FLAGS, smtp_config: { ...EMPTY_SMTP } };

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showEditSmtpPass, setShowEditSmtpPass] = useState(false);

  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const projects: any[] = projectsData?.data?.projects || [];

  const { data, isLoading } = useQuery({
    queryKey: ['integrations', filterProjectId],
    queryFn: () => integrationsApi.list(filterProjectId || undefined),
  });
  const integrations: any[] = data?.data?.integrations || [];

  const create = useMutation({
    mutationFn: () => integrationsApi.create({
      ...form,
      project_id: form.project_id || null,
      smtp_config: form.type === 'smtp' ? form.smtp_config : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setShowForm(false);
      setShowGuide(false);
      setForm({ ...EMPTY_FORM });
      toast.success('Integração criada com sucesso');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => integrationsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setEditingId(null);
      setEditForm(null);
      toast.success('Integração atualizada');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => integrationsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['integrations'] }); toast.success('Integração removida'); },
    onError: () => toast.error('Erro ao remover integração'),
  });

  const testIntegration = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await integrationsApi.test(id);
      setTestResult({ id, ok: res.data.ok });
      if (res.data.ok) toast.success('Webhook enviado com sucesso!');
      else toast.error('Falha ao enviar webhook');
    } catch {
      setTestResult({ id, ok: false });
      toast.error('Erro ao testar integração');
    } finally {
      setTestingId(null);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const startEdit = (intg: any) => {
    setEditingId(intg.id);
    setEditForm({
      label: intg.label,
      webhook_url: intg.webhook_url || '',
      events: Array.isArray(intg.events) ? intg.events : [],
      enabled: !!intg.enabled,
      project_id: intg.project_id || '',
      include_flags: { ...EMPTY_FLAGS, ...(intg.include_flags || {}) },
      smtp_config: { ...EMPTY_SMTP, ...(intg.smtp_config || {}) },
    });
  };

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const toggleEditEvent = (event: string) => {
    setEditForm((f: any) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e: string) => e !== event) : [...f.events, event],
    }));
  };

  const typeInfo = (type: string) => TYPES.find(t => t.value === type) || TYPES[TYPES.length - 1];
  const selectedType = typeInfo(form.type);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Integrações</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Notificações para Discord, Slack, Teams, Telegram, PagerDuty, Mattermost, Opsgenie, Datadog, Grafana, Linear e webhooks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Project filter */}
          <div className="relative">
            <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <select
              className="input pl-8 pr-8 text-xs h-8"
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
            >
              <option value="">Todos os projetos</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(v => !v); setShowGuide(false); }}>
            <Plus className="w-4 h-4" /> Nova Integração
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nova Integração</h3>
            <button className="p-1 rounded" style={{ color: 'var(--text-muted)' }} onClick={() => { setShowForm(false); setShowGuide(false); }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Tipo *</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setForm(f => ({ ...f, type: t.value })); setShowGuide(false); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${form.type === t.value ? `${t.bg} ${t.color}` : ''}`}
                  style={form.type !== t.value ? { color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' } : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step-by-step guide */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
              onClick={() => setShowGuide(v => !v)}
            >
              <span className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                Como obter a URL do {selectedType.label}
              </span>
              {showGuide ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
            </button>
            {showGuide && (
              <div className="px-4 py-3 space-y-2" style={{ background: 'var(--surface-1)' }}>
                {selectedType.docUrl && (
                  <a
                    href={selectedType.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs mt-2"
                    style={{ color: 'var(--primary)' }}
                  >
                    <ExternalLink className="w-3 h-3" /> Documentação oficial do {selectedType.label}
                  </a>
                )}
                {selectedType.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{step}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Rótulo *</label>
              <input
                className="input"
                placeholder="Ex: #alerts-ci, Equipe QA"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>
            {form.type !== 'smtp' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                  {form.type === 'telegram' ? 'URL da API do Bot *' : 'Webhook URL *'}
                </label>
                <div className="relative">
                  <input
                    className="input pr-8"
                    placeholder={selectedType.urlPlaceholder}
                    value={form.webhook_url}
                    onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))}
                  />
                  {form.webhook_url && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <CopyBtn text={form.webhook_url} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SMTP config fields */}
          {form.type === 'smtp' && (
            <div className="rounded border p-4 space-y-3" style={{ borderColor: 'rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.04)' }}>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#fb923c' }}>
                <Mail className="w-3.5 h-3.5" /> Configuração SMTP
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Host *</label>
                  <input className="input text-xs" placeholder="smtp.gmail.com" value={form.smtp_config.host}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, host: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Porta</label>
                  <input className="input text-xs" type="number" placeholder="587" value={form.smtp_config.port}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, port: Number(e.target.value) } }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Usuário *</label>
                  <input className="input text-xs" placeholder="seu@email.com" value={form.smtp_config.user}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, user: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Senha *</label>
                  <div className="relative">
                    <input className="input text-xs pr-8" type={showSmtpPass ? 'text' : 'password'} placeholder="Senha ou App Password"
                      value={form.smtp_config.pass}
                      onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, pass: e.target.value } }))} />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}
                      onClick={() => setShowSmtpPass(v => !v)}>
                      {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Remetente (from) *</label>
                  <input className="input text-xs" placeholder="goState &lt;alerts@empresa.com&gt;" value={form.smtp_config.from}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, from: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Destinatário(s) (to) *</label>
                  <input className="input text-xs" placeholder="qa@empresa.com, dev@empresa.com" value={form.smtp_config.to}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, to: e.target.value } }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Prefixo do assunto</label>
                  <input className="input text-xs" placeholder="[goState]" value={form.smtp_config.subject_prefix}
                    onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, subject_prefix: e.target.value } }))} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-orange-500" checked={form.smtp_config.secure}
                      onChange={e => setForm(f => ({ ...f, smtp_config: { ...f.smtp_config, secure: e.target.checked } }))} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>SSL (porta 465)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Project scope */}
          <div>
            <label className="block text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <FolderOpen className="w-3 h-3" /> Escopo do projeto
            </label>
            <select
              className="input text-sm"
              value={form.project_id || ''}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value || null }))}
            >
              <option value="">Global — todos os projetos</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>"Global" dispara para execuções de qualquer projeto.</p>
          </div>

          {/* Include flags */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>O que incluir na notificação</label>
            <div className="space-y-2">
              {INCLUDE_FLAGS_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = form.include_flags[opt.key as keyof typeof EMPTY_FLAGS];
                return (
                  <label key={opt.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    active ? 'border-violet-500/40 bg-violet-500/8' : ''
                  }`} style={!active ? { borderColor: 'var(--border)', background: 'transparent' } : {}}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-violet-500"
                      checked={active}
                      onChange={() => setForm(f => ({ ...f, include_flags: { ...f.include_flags, [opt.key]: !active } }))}
                    />
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-violet-400' : ''}`} style={!active ? { color: 'var(--text-muted)' } : {}} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{opt.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Events */}
          <div>
            <label className="block text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Bell className="w-3 h-3" /> Eventos a notificar
            </label>
            <div className="space-y-3">
              {EVENT_GROUPS.map(group => (
                <div key={group.group}>
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{group.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.events.map(ev => {
                      const Icon = ev.icon;
                      const active = form.events.includes(ev.value);
                      return (
                        <button
                          key={ev.value}
                          type="button"
                          onClick={() => toggleEvent(ev.value)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${active ? ev.activeBg : ''}`}
                          style={!active ? { color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' } : {}}
                        >
                          <Icon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-50'}`} />
                          {ev.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {form.events.length === 0 && (
              <p className="text-xs text-amber-500 mt-1.5">Selecione pelo menos um evento.</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!form.label || (form.type !== 'smtp' && !form.webhook_url) || (form.type === 'smtp' && (!form.smtp_config.host || !form.smtp_config.user || !form.smtp_config.pass || !form.smtp_config.from || !form.smtp_config.to)) || form.events.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar Integração
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setShowGuide(false); }}>Cancelar</button>
          </div>
          {create.isError && <p className="text-xs text-red-400">{getErrorMessage(create.error)}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : integrations.length === 0 ? (
        <div className="card p-12 text-center">
          <Webhook className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Nenhuma integração configurada</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Configure notificações para Discord, Slack, Teams, Telegram ou qualquer webhook
          </p>
        </div>
      ) : (
        <>
          <style>{`
            .flip-card { perspective: 1000px; }
            .flip-card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
            .flip-card:hover .flip-card-inner { transform: rotateY(180deg); }
            .flip-card.is-editing .flip-card-inner { transform: rotateY(180deg); }
            .flip-card-front, .flip-card-back { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 0.75rem; }
            .flip-card-back { transform: rotateY(180deg); }
          `}</style>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {integrations.map((intg) => {
              const info = typeInfo(intg.type);
              const events: string[] = Array.isArray(intg.events) ? intg.events : [];
              const flags = intg.include_flags || {};
              const activeFlags = INCLUDE_FLAGS_OPTIONS.filter(o => flags[o.key]);
              const intgProject = projects.find((p: any) => p.id === intg.project_id);
              const isEditing = editingId === intg.id;

              const typeGradient: Record<string, string> = {
                discord: 'from-indigo-600/30 to-indigo-900/60',
                slack: 'from-green-600/30 to-green-900/60',
                mattermost: 'from-blue-400/20 to-blue-900/50',
                teams: 'from-blue-600/30 to-blue-900/60',
                telegram: 'from-sky-600/30 to-sky-900/60',
                pagerduty: 'from-emerald-600/30 to-emerald-900/60',
                opsgenie: 'from-orange-400/20 to-orange-900/50',
                datadog: 'from-purple-600/30 to-purple-900/60',
                grafana: 'from-orange-600/30 to-orange-900/60',
                linear: 'from-violet-600/30 to-violet-900/60',
                webhook: 'from-slate-600/30 to-slate-900/60',
                smtp: 'from-orange-600/30 to-orange-900/60',
                jira: 'from-blue-700/30 to-blue-950/60',
                github: 'from-slate-500/30 to-slate-900/60',
              };
              const typeBorderColor: Record<string, string> = {
                discord: '#6366f150',
                slack: '#22c55e50',
                mattermost: '#60a5fa50',
                teams: '#3b82f650',
                telegram: '#0ea5e950',
                pagerduty: '#10b98150',
                opsgenie: '#fb923c50',
                datadog: '#a855f750',
                grafana: '#f9731650',
                linear: '#8b5cf650',
                webhook: '#64748b50',
                smtp: '#f9731650',
                jira: '#2563eb50',
                github: '#94a3b850',
              };
              const typeIconBg: Record<string, string> = {
                discord: 'rgba(99,102,241,0.2)',
                slack: 'rgba(34,197,94,0.2)',
                mattermost: 'rgba(96,165,250,0.2)',
                teams: 'rgba(59,130,246,0.2)',
                telegram: 'rgba(14,165,233,0.2)',
                pagerduty: 'rgba(16,185,129,0.2)',
                opsgenie: 'rgba(251,146,60,0.2)',
                datadog: 'rgba(168,85,247,0.2)',
                grafana: 'rgba(249,115,22,0.2)',
                linear: 'rgba(139,92,246,0.2)',
                webhook: 'rgba(100,116,139,0.2)',
                smtp: 'rgba(249,115,22,0.2)',
                jira: 'rgba(37,99,235,0.2)',
                github: 'rgba(148,163,184,0.2)',
              };

              const CARD_HEIGHT = '200px';

              return (
                <div key={intg.id} className="space-y-2">
                <div
                  className={`flip-card ${isEditing ? 'is-editing' : ''}`}
                  style={{ height: CARD_HEIGHT, minHeight: CARD_HEIGHT }}
                >
                  <div className="flip-card-inner" style={{ height: CARD_HEIGHT, minHeight: CARD_HEIGHT }}>

                    {/* ── FRENTE ── */}
                    <div
                      className={`flip-card-front flex flex-col items-center justify-center gap-3 p-5 bg-gradient-to-br ${typeGradient[intg.type] || typeGradient.webhook}`}
                      style={{ border: `1px solid ${typeBorderColor[intg.type] || '#64748b50'}`, background: 'var(--surface-1)' }}
                    >
                      {/* Status dot */}
                      <div className="absolute top-3 right-3">
                        <span className={`inline-flex w-2 h-2 rounded-full ${intg.enabled ? 'bg-green-400' : 'bg-slate-600'}`} />
                      </div>

                      {/* Service icon area */}
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: typeIconBg[intg.type] || typeIconBg.webhook, border: `1px solid ${typeBorderColor[intg.type] || '#64748b50'}` }}>
                        <Webhook className={`w-7 h-7 ${info.color}`} />
                      </div>

                      {/* Service tag */}
                      <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${info.bg} ${info.color}`}>
                        {info.label}
                      </span>

                      {/* Hook name */}
                      <p className="text-sm font-bold text-center leading-tight" style={{ color: 'var(--text)' }}>
                        {intg.label}
                      </p>

                      {/* Hint */}
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Passe o mouse para detalhes</p>
                    </div>

                    {/* ── VERSO ── */}
                    <div
                      className="flip-card-back flex flex-col p-4 overflow-y-auto"
                      style={{
                        background: 'var(--surface-1)',
                        border: `1px solid ${typeBorderColor[intg.type] || '#64748b50'}`,
                        height: CARD_HEIGHT,
                        minHeight: CARD_HEIGHT,
                      }}
                    >
                      <>
                          {/* Back header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${info.bg} ${info.color}`}>{info.label}</span>
                              <span className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{intg.label}</span>
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button className="p-1.5 rounded hover:bg-violet-500/10 transition-colors" style={{ color: 'var(--text-muted)' }} title="Editar" onClick={() => startEdit(intg)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={() => { if (confirm('Remover integração?')) remove.mutate(intg.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* URL */}
                          <p className="text-xs font-mono truncate mb-2" style={{ color: 'var(--text-muted)' }} title={intg.webhook_url}>{intg.webhook_url}</p>

                          {/* Scope + flags */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {intgProject ? (
                              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                <FolderOpen className="w-3 h-3" />{intgProject.name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                <Globe className="w-3 h-3" />Global
                              </span>
                            )}
                            {activeFlags.map(f => {
                              const Icon = f.icon;
                              return (
                                <span key={f.key} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">
                                  <Icon className="w-3 h-3" />{f.label}
                                </span>
                              );
                            })}
                          </div>

                          {/* Events */}
                          <div className="flex flex-wrap gap-1 mb-auto">
                            {events.map((ev: string) => {
                              const evInfo = EVENTS.find(e => e.value === ev);
                              const Icon = evInfo?.icon || Bell;
                              return (
                                <span key={ev} className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${evInfo?.activeBg || ''}`}
                                  style={!evInfo ? { background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' } : {}}>
                                  <Icon className="w-3 h-3" />{evInfo?.label || ev}
                                </span>
                              );
                            })}
                          </div>

                          {/* Footer */}
                          <div className="pt-2 mt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(intg.created_at)}</span>
                            <button
                              className="flex items-center gap-1.5 text-xs btn-ghost py-1 px-2"
                              disabled={testingId === intg.id}
                              onClick={() => testIntegration(intg.id)}
                            >
                              {testingId === intg.id ? <Loader2 className="w-3 h-3 animate-spin" />
                                : testResult?.id === intg.id
                                  ? (testResult?.ok ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <AlertCircle className="w-3 h-3 text-red-400" />)
                                  : <Send className="w-3 h-3" />}
                              {testResult?.id === intg.id ? (testResult?.ok ? 'Enviado!' : 'Falhou') : 'Testar'}
                            </button>
                          </div>
                      </>
                    </div>
                  </div>
                </div>

                {/* ── EDIT PANEL (fora do flip, expande abaixo) ── */}
                {isEditing && editForm && (
                  <div className="card p-4 space-y-3" style={{ border: `1px solid ${typeBorderColor[intg.type] || '#64748b50'}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${info.bg} ${info.color}`}>{info.label}</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Editar: {intg.label}</span>
                      </div>
                      <button className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Rótulo</label>
                        <input className="input text-xs" value={editForm.label} onChange={e => setEditForm((f: any) => ({ ...f, label: e.target.value }))} />
                      </div>
                      {intg.type !== 'smtp' && (
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Webhook URL</label>
                          <input className="input text-xs" value={editForm.webhook_url} onChange={e => setEditForm((f: any) => ({ ...f, webhook_url: e.target.value }))} />
                        </div>
                      )}
                    </div>

                    {/* SMTP fields no edit panel */}
                    {intg.type === 'smtp' && editForm.smtp_config && (
                      <div className="rounded border p-3 space-y-2" style={{ borderColor: 'rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.04)' }}>
                        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#fb923c' }}>
                          <Mail className="w-3.5 h-3.5" /> Configuração SMTP
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Host</label>
                            <input className="input text-xs" placeholder="smtp.gmail.com" value={editForm.smtp_config.host || ''}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, host: e.target.value } }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Porta</label>
                            <input className="input text-xs" type="number" value={editForm.smtp_config.port || 587}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, port: Number(e.target.value) } }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Usuário</label>
                            <input className="input text-xs" value={editForm.smtp_config.user || ''}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, user: e.target.value } }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Senha</label>
                            <div className="relative">
                              <input className="input text-xs pr-8" type={showEditSmtpPass ? 'text' : 'password'} value={editForm.smtp_config.pass || ''}
                                onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, pass: e.target.value } }))} />
                              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}
                                onClick={() => setShowEditSmtpPass(v => !v)}>
                                {showEditSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Remetente (from)</label>
                            <input className="input text-xs" value={editForm.smtp_config.from || ''}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, from: e.target.value } }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Destinatário(s) (to)</label>
                            <input className="input text-xs" value={editForm.smtp_config.to || ''}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, to: e.target.value } }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Prefixo do assunto</label>
                            <input className="input text-xs" value={editForm.smtp_config.subject_prefix || '[goState]'}
                              onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, subject_prefix: e.target.value } }))} />
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="accent-orange-500" checked={!!editForm.smtp_config.secure}
                                onChange={e => setEditForm((f: any) => ({ ...f, smtp_config: { ...f.smtp_config, secure: e.target.checked } }))} />
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>SSL (porta 465)</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Projeto</label>
                      <select className="input text-xs" value={editForm.project_id || ''} onChange={e => setEditForm((f: any) => ({ ...f, project_id: e.target.value || null }))}>
                        <option value="">Global</option>
                        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Eventos</label>
                      <div className="space-y-2">
                        {EVENT_GROUPS.map(group => (
                          <div key={group.group}>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{group.group}</p>
                            <div className="flex flex-wrap gap-1">
                              {group.events.map(ev => {
                                const Icon = ev.icon;
                                const active = editForm.events.includes(ev.value);
                                return (
                                  <button key={ev.value} type="button" onClick={() => toggleEditEvent(ev.value)}
                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-medium transition-all ${active ? ev.activeBg : ''}`}
                                    style={!active ? { color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' } : {}}>
                                    <Icon className="w-3 h-3" />{ev.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Incluir na notificação</label>
                      <div className="space-y-1.5">
                        {INCLUDE_FLAGS_OPTIONS.map(opt => {
                          const Icon = opt.icon;
                          const active = editForm.include_flags[opt.key];
                          return (
                            <label key={opt.key} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${active ? 'border-violet-500/40 bg-violet-500/8' : ''}`}
                              style={!active ? { borderColor: 'var(--border)', background: 'transparent' } : {}}>
                              <input type="checkbox" className="mt-0.5 accent-violet-500" checked={active}
                                onChange={() => setEditForm((f: any) => ({ ...f, include_flags: { ...f.include_flags, [opt.key]: !active } }))} />
                              <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? 'text-violet-400' : ''}`} style={!active ? { color: 'var(--text-muted)' } : {}} />
                              <div>
                                <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{opt.label}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5" disabled={update.isPending}
                        onClick={() => update.mutate({ id: intg.id, data: { ...editForm, project_id: editForm.project_id || null } })}>
                        {update.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar
                      </button>
                      <button className="btn-ghost text-xs py-1 px-3" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  </div>
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
