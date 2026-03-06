import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Loader2, Webhook, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { useToast } from '../components/Toast';

const TYPES = [
  { value: 'discord', label: 'Discord', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  { value: 'slack', label: 'Slack', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  { value: 'teams', label: 'Microsoft Teams', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { value: 'webhook', label: 'Webhook Genérico', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
];

const EVENTS = [
  { value: 'execution.passed', label: 'Execução passou ✅' },
  { value: 'execution.failed', label: 'Execução falhou ❌' },
  { value: 'execution.error', label: 'Execução com erro ⚠️' },
  { value: 'execution.started', label: 'Execução iniciada 🚀' },
];

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
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

  const typeInfo = (type: string) => TYPES.find(t => t.value === type) || TYPES[3];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Integrações</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Notificações para Discord, Slack, Teams e webhooks</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" /> Nova Integração
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nova Integração</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tipo *</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Rótulo *</label>
              <input className="input" placeholder="Ex: #alerts-ci" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Webhook URL *</label>
              <input className="input" placeholder="https://discord.com/api/webhooks/..." value={form.webhook_url} onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Eventos a notificar</label>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map(ev => (
                <button
                  key={ev.value}
                  type="button"
                  onClick={() => toggleEvent(ev.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.events.includes(ev.value)
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                    : 'bg-transparent border hover:border-blue-400/50'
                  }`}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!form.label || !form.webhook_url || form.events.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
          {create.isError && <p className="text-xs text-red-400">{(create.error as any)?.response?.data?.error}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : integrations.length === 0 ? (
        <div className="card p-12 text-center">
          <Webhook className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma integração configurada</p>
          <p className="text-sm text-slate-600 mt-1">Configure notificações para Discord, Slack ou qualquer webhook</p>
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
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${info.bg} ${info.color}`}>
                      {info.label}
                    </span>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{intg.label}</p>
                      <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{intg.webhook_url}</p>
                    </div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--text-muted)' }}
                    onClick={() => { if (confirm('Remover integração?')) remove.mutate(intg.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {events.map((ev: string) => (
                    <span key={ev} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {EVENTS.find(e => e.value === ev)?.label || ev}
                    </span>
                  ))}
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
