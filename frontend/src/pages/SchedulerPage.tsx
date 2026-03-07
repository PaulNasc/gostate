import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesApi, projectsApi, agentsApi, environmentsApi, testPlansApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Clock, Trash2, Loader2, ToggleLeft, ToggleRight, CalendarClock, PlayCircle, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { useToast } from '../components/Toast';

const CRON_PRESETS = [
  { label: 'A cada 5 min', value: '*/5 * * * *' },
  { label: 'A cada 10 min', value: '*/10 * * * *' },
  { label: 'A cada 15 min', value: '*/15 * * * *' },
  { label: 'A cada 30 min', value: '*/30 * * * *' },
  { label: 'A cada hora', value: '0 * * * *' },
  { label: 'A cada 6 horas', value: '0 */6 * * *' },
  { label: 'Diariamente às 8h', value: '0 8 * * *' },
  { label: 'Diariamente à meia-noite', value: '0 0 * * *' },
  { label: 'Toda segunda às 9h', value: '0 9 * * 1' },
  { label: 'Toda semana (dom)', value: '0 0 * * 0' },
];

function cronLabel(expr: string): string {
  const found = CRON_PRESETS.find(p => p.value === expr);
  return found ? found.label : expr;
}

function nextRunFromCron(cronExpr: string, lastRun?: string): string {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return '—';
    const [minute, hour] = parts;

    let intervalMs = 60 * 60 * 1000;
    if (minute.startsWith('*/')) intervalMs = parseInt(minute.slice(2)) * 60 * 1000;
    else if (hour.startsWith('*/')) intervalMs = parseInt(hour.slice(2)) * 60 * 60 * 1000;
    else if (minute === '0' && hour === '0') intervalMs = 24 * 60 * 60 * 1000;
    else if (minute === '0') intervalMs = 60 * 60 * 1000;

    const base = lastRun ? new Date(lastRun).getTime() : Date.now();
    const next = new Date(base + intervalMs);
    const diff = next.getTime() - Date.now();
    if (diff < 0) return 'Em breve';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `em ${mins}min`;
    const hrs = Math.round(diff / 3600000);
    if (hrs < 24) return `em ${hrs}h`;
    return `em ${Math.round(diff / 86400000)}d`;
  } catch {
    return '—';
  }
}

export default function SchedulerPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [customCron, setCustomCron] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCron, setEditCron] = useState('');
  const [form, setForm] = useState({
    label: '',
    mode: 'tc' as 'tc' | 'plan',
    project_id: '',
    test_plan_id: '',
    environment_id: '',
    cron: '0 8 * * *',
    agent_id: '',
    browsers: 'chromium',
    enabled: true,
  });

  const { data, isLoading } = useQuery({ queryKey: ['schedules'], queryFn: () => schedulesApi.list(), refetchInterval: 30000 });
  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const { data: envsData } = useQuery({
    queryKey: ['environments', form.project_id],
    queryFn: () => environmentsApi.list(form.project_id),
    enabled: !!form.project_id,
  });

  const { data: plansData } = useQuery({
    queryKey: ['test-plans-sched', form.project_id],
    queryFn: () => testPlansApi.list(form.project_id),
    enabled: !!form.project_id && form.mode === 'plan',
  });
  const plans: any[] = plansData?.data?.items || [];

  const schedules: any[] = data?.data?.schedules || [];
  const projects: any[] = projectsData?.data?.projects || [];
  const agents: any[] = agentsData?.data?.agents || [];
  const envs: any[] = envsData?.data?.items || [];

  const activeCount = schedules.filter(s => s.enabled).length;

  const create = useMutation({
    mutationFn: () => schedulesApi.create({
      label: form.label,
      project_id: form.project_id || undefined,
      test_plan_id: form.mode === 'plan' ? (form.test_plan_id || undefined) : undefined,
      environment_id: form.environment_id || undefined,
      cron: form.cron,
      agent_id: form.agent_id || undefined,
      browsers: [form.browsers],
      enabled: form.enabled,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setShowForm(false);
      setCustomCron(false);
      setForm({ label: '', mode: 'tc', project_id: '', test_plan_id: '', environment_id: '', cron: '0 8 * * *', agent_id: '', browsers: 'chromium', enabled: true });
      toast.success('Agendamento criado');
    },
    onError: () => toast.error('Erro ao criar agendamento'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => schedulesApi.update(id, { enabled }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['schedules'] }); toast.info(v.enabled ? 'Agendamento ativado' : 'Agendamento pausado'); },
    onError: () => toast.error('Erro ao atualizar agendamento'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => schedulesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); toast.success('Agendamento removido'); },
    onError: () => toast.error('Erro ao remover agendamento'),
  });

  const updateSchedule = useMutation({
    mutationFn: ({ id, label, cron }: { id: string; label: string; cron: string }) =>
      schedulesApi.update(id, { label, cron }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setEditingId(null);
      toast.success('Agendamento atualizado');
    },
    onError: () => toast.error('Erro ao atualizar agendamento'),
  });

  const startEdit = (s: any) => { setEditingId(s.id); setEditLabel(s.label); setEditCron(s.cron); };
  const cancelEdit = () => setEditingId(null);
  const commitEdit = (id: string) => { if (editLabel.trim() && editCron.trim()) updateSchedule.mutate({ id, label: editLabel.trim(), cron: editCron.trim() }); };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Agendamentos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {activeCount} ativo{activeCount !== 1 ? 's' : ''} de {schedules.length} total
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(!showForm); setCustomCron(false); }}>
          <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      {/* Summary cards */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card px-4 py-3">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{schedules.length}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Ativos</p>
            <p className="text-2xl font-bold text-green-400">{activeCount}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Inativos</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-muted)' }}>{schedules.length - activeCount}</p>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Novo Agendamento</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Rótulo *</label>
              <input className="input" placeholder="Ex: Smoke Tests — Produção" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Tipo de alvo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${form.mode === 'tc' ? 'border-blue-500/60 bg-blue-500/10 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                  style={form.mode !== 'tc' ? { borderColor: 'var(--border)' } : {}}
                  onClick={() => setForm(f => ({ ...f, mode: 'tc', test_plan_id: '' }))}
                >
                  Caso de Teste (via Projeto)
                </button>
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${form.mode === 'plan' ? 'border-purple-500/60 bg-purple-500/10 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                  style={form.mode !== 'plan' ? { borderColor: 'var(--border)' } : {}}
                  onClick={() => setForm(f => ({ ...f, mode: 'plan' }))}
                >
                  Test Plan
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Projeto *</label>
              <select className="input" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, test_plan_id: '' }))}>
                <option value="">Selecione um projeto</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Agente</label>
              <select className="input" value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}>
                <option value="">Auto (qualquer disponível)</option>
                {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name} {a.status === 'online' ? '●' : '○'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Frequência</label>
              {!customCron ? (
                <div className="flex gap-2">
                  <select className="input flex-1" value={form.cron} onChange={e => setForm(f => ({ ...f, cron: e.target.value }))}>
                    {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <button className="btn-ghost text-xs px-2" onClick={() => setCustomCron(true)} title="Expressão customizada">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono text-sm" placeholder="* * * * *" value={form.cron} onChange={e => setForm(f => ({ ...f, cron: e.target.value }))} />
                  <button className="btn-ghost text-xs px-2" onClick={() => setCustomCron(false)}>←</button>
                </div>
              )}
              <p className="text-xs text-slate-600 mt-1">Expressão: <code className="text-blue-400">{form.cron}</code></p>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Browser</label>
              <select className="input" value={form.browsers} onChange={e => setForm(f => ({ ...f, browsers: e.target.value }))}>
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </select>
            </div>
            {form.mode === 'plan' && form.project_id && (
              <div className="col-span-2">
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Test Plan *</label>
                <select className="input" value={form.test_plan_id} onChange={e => setForm(f => ({ ...f, test_plan_id: e.target.value }))}>
                  <option value="">Selecione um plano</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {plans.length === 0 && (
                  <p className="text-xs mt-1 text-amber-400">Nenhum test plan encontrado para este projeto.</p>
                )}
              </div>
            )}
            {envs.length > 0 && (
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Ambiente</label>
                <select className="input" value={form.environment_id} onChange={e => setForm(f => ({ ...f, environment_id: e.target.value }))}>
                  <option value="">Nenhum (sem variáveis)</option>
                  {envs.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.variables?.length || 0} vars)</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {create.isError && <p className="text-xs text-red-400">{(create.error as any)?.response?.data?.error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!form.label.trim() || !form.project_id || !form.cron || create.isPending || (form.mode === 'plan' && !form.test_plan_id)}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar Agendamento
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : schedules.length === 0 ? (
        <div className="card p-12 text-center">
          <CalendarClock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum agendamento configurado</p>
          <p className="text-sm text-slate-600 mt-1">Agende execuções automáticas usando cron expressions</p>
          <button className="btn-primary mt-4 flex items-center gap-2 mx-auto" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Criar Agendamento
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rótulo</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Projeto / TC</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Frequência</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Última execução</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Próxima</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b transition-colors group" onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    {editingId === s.id ? (
                      <input
                        className="input text-sm py-1 w-full"
                        value={editLabel}
                        autoFocus
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(s.id); if (e.key === 'Escape') cancelEdit(); }}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${s.enabled ? 'text-green-400' : 'text-slate-600'}`} />
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{s.label}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[160px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {s.plan_name ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Plano</span>
                        {s.plan_name}
                      </span>
                    ) : (s.project_name || s.tc_title || '—')}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === s.id ? (
                      <input
                        className="input text-xs font-mono py-1 w-full"
                        value={editCron}
                        onChange={e => setEditCron(e.target.value)}
                        placeholder="* * * * *"
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(s.id); if (e.key === 'Escape') cancelEdit(); }}
                      />
                    ) : (
                      <div>
                        <span className="text-xs" style={{ color: 'var(--text)' }}>{cronLabel(s.cron)}</span>
                        <code className="block text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.cron}</code>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {s.last_run ? formatDate(s.last_run) : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Nunca executou</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.enabled ? (
                      <span className="text-xs text-blue-400 flex items-center gap-1">
                        <PlayCircle className="w-3 h-3" />
                        {nextRunFromCron(s.cron, s.last_run)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${s.enabled ? 'text-green-400 hover:text-green-300' : 'text-slate-600 hover:text-slate-400'}`}
                      onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}
                    >
                      {s.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {s.enabled ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {editingId === s.id ? (
                        <>
                          <button
                            className="p-1.5 rounded hover:bg-green-500/10 text-green-400 transition-all"
                            onClick={() => commitEdit(s.id)}
                            title="Salvar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-slate-500/10 transition-all" style={{ color: 'var(--text-muted)' }}
                            onClick={cancelEdit}
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-blue-500/10 hover:text-blue-400 transition-all" style={{ color: 'var(--text-muted)' }}
                            onClick={() => startEdit(s)}
                            title="Editar agendamento"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--text-muted)' }}
                            onClick={() => { if (confirm(`Remover "${s.label}"?`)) remove.mutate(s.id); }}
                            title="Remover agendamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
