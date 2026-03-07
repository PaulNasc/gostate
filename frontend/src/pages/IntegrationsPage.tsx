import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Plus, Trash2, Loader2, Webhook, CheckCircle2, AlertCircle, Send,
  Play, XCircle, Zap, Bell, ChevronDown, ChevronUp, ExternalLink, Copy, Check,
} from 'lucide-react';
import { useToast } from '../components/Toast';

const TYPES = [
  {
    value: 'discord', label: 'Discord',
    color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20',
    urlPlaceholder: 'https://discord.com/api/webhooks/ID/TOKEN',
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
    steps: [
      'Acesse api.slack.com/apps e clique em "Create New App".',
      'Escolha "From scratch", dê um nome e selecione o workspace.',
      'Em "Features", ative "Incoming Webhooks".',
      'Clique em "Add New Webhook to Workspace" e selecione o canal.',
      'Copie a "Webhook URL" gerada e cole no campo abaixo.',
    ],
  },
  {
    value: 'teams', label: 'Microsoft Teams',
    color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20',
    urlPlaceholder: 'https://outlook.office.com/webhook/...',
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
    color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20',
    urlPlaceholder: 'https://events.pagerduty.com/v2/enqueue',
    steps: [
      'No PagerDuty, vá em "Services" → "Service Directory".',
      'Selecione ou crie um serviço, depois vá em "Integrations".',
      'Adicione uma integração do tipo "Events API v2".',
      'Copie a "Integration Key" gerada.',
      'Use a URL: https://events.pagerduty.com/v2/enqueue (a chave vai no corpo da requisição — configure via webhook genérico se necessário).',
    ],
  },
  {
    value: 'webhook', label: 'Webhook Genérico',
    color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20',
    urlPlaceholder: 'https://seu-servidor.com/webhook',
    steps: [
      'Configure um endpoint HTTP POST no seu servidor.',
      'O goState enviará um JSON com: event, execution_id, status, test_case, project, timestamp.',
      'Valide a autenticidade verificando o header X-GoState-Event.',
      'Responda com status 2xx para confirmar recebimento.',
      'Cole a URL do seu endpoint no campo abaixo.',
    ],
  },
];

const EVENTS = [
  { value: 'execution.passed', label: 'Passou', icon: CheckCircle2, color: 'text-green-500', activeBg: 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400' },
  { value: 'execution.failed', label: 'Falhou', icon: XCircle, color: 'text-red-500', activeBg: 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400' },
  { value: 'execution.error', label: 'Erro', icon: AlertCircle, color: 'text-amber-500', activeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400' },
  { value: 'execution.started', label: 'Iniciada', icon: Play, color: 'text-blue-500', activeBg: 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400' },
];

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

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [form, setForm] = useState({
    type: 'discord',
    label: '',
    webhook_url: '',
    events: ['execution.failed'] as string[],
    enabled: true,
  });

  const { data, isLoading } = useQuery({ queryKey: ['integrations'], queryFn: () => integrationsApi.list() });
  const integrations: any[] = data?.data?.integrations || [];

  const create = useMutation({
    mutationFn: () => integrationsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setShowForm(false);
      setShowGuide(false);
      setForm({ type: 'discord', label: '', webhook_url: '', events: ['execution.failed'], enabled: true });
      toast.success('Integração criada com sucesso');
    },
    onError: () => toast.error('Erro ao criar integração'),
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

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const typeInfo = (type: string) => TYPES.find(t => t.value === type) || TYPES[TYPES.length - 1];
  const selectedType = typeInfo(form.type);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Integrações</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Notificações para Discord, Slack, Teams, Telegram, PagerDuty e webhooks
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(v => !v); setShowGuide(false); }}>
          <Plus className="w-4 h-4" /> Nova Integração
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nova Integração</h3>

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
                {selectedType.value !== 'webhook' && (
                  <a
                    href={
                      selectedType.value === 'discord' ? 'https://support.discord.com/hc/en-us/articles/228383668' :
                      selectedType.value === 'slack' ? 'https://api.slack.com/messaging/webhooks' :
                      selectedType.value === 'teams' ? 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook' :
                      selectedType.value === 'telegram' ? 'https://core.telegram.org/bots/api' :
                      'https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTgw-send-an-alert-event'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs mt-2"
                    style={{ color: 'var(--primary)' }}
                  >
                    <ExternalLink className="w-3 h-3" /> Documentação oficial do {selectedType.label}
                  </a>
                )}
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
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                {selectedType.value === 'telegram' ? 'URL da API do Bot *' : 'Webhook URL *'}
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
          </div>

          {/* Events */}
          <div>
            <label className="block text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Bell className="w-3 h-3" /> Eventos a notificar
            </label>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map(ev => {
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
            {form.events.length === 0 && (
              <p className="text-xs text-amber-500 mt-1.5">Selecione pelo menos um evento.</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!form.label || !form.webhook_url || form.events.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar Integração
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setShowGuide(false); }}>Cancelar</button>
          </div>
          {create.isError && <p className="text-xs text-red-400">{(create.error as any)?.response?.data?.error}</p>}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((intg) => {
            const info = typeInfo(intg.type);
            const events: string[] = Array.isArray(intg.events) ? intg.events : [];
            return (
              <div key={intg.id} className="card p-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${info.bg} ${info.color}`}>
                      {info.label}
                    </span>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{intg.label}</p>
                      <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{intg.webhook_url}</p>
                    </div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => { if (confirm('Remover integração?')) remove.mutate(intg.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {events.map((ev: string) => {
                    const evInfo = EVENTS.find(e => e.value === ev);
                    const Icon = evInfo?.icon || Bell;
                    return (
                      <span
                        key={ev}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border font-medium ${evInfo?.activeBg || ''}`}
                        style={!evInfo ? { background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' } : {}}
                      >
                        <Icon className="w-3 h-3" />
                        {evInfo?.label || ev}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(intg.created_at)}</span>
                  <button
                    className="flex items-center gap-1.5 text-xs btn-ghost py-1 px-2"
                    disabled={testingId === intg.id}
                    onClick={() => testIntegration(intg.id)}
                  >
                    {testingId === intg.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : testResult?.id === intg.id ? (
                      testResult?.ok ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <AlertCircle className="w-3 h-3 text-red-400" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    {testResult?.id === intg.id ? (testResult?.ok ? 'Enviado!' : 'Falhou') : 'Testar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
