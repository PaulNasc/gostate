import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testPlansApi, suitesApi, testcasesApi, API_BASE } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Plus, Play, Trash2, Loader2, ClipboardList, CheckCircle2,
  XCircle, AlertCircle, RotateCcw, ChevronDown, ChevronUp, ArrowLeft,
  Clock, RefreshCw, GripVertical, ListOrdered,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { io as socketIo } from 'socket.io-client';

function PlanProgressBar({ passed, failed, error, running, total }: any) {
  if (!total) return null;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-3)' }}>
      <div className="h-full bg-green-500 transition-all" style={{ width: pct(passed) }} title={`${passed} passou`} />
      <div className="h-full bg-red-500 transition-all" style={{ width: pct(failed) }} title={`${failed} falhou`} />
      <div className="h-full bg-orange-400 transition-all" style={{ width: pct(error) }} title={`${error} erro`} />
      <div className="h-full bg-blue-400 transition-all animate-pulse" style={{ width: pct(running) }} title={`${running} rodando`} />
    </div>
  );
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'passed') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-orange-400" />;
  if (status === 'running' || status === 'queued') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500" />;
}

export default function TestPlansPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showTcOrder, setShowTcOrder] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', max_parallel: 1 });
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [orderedTcIds, setOrderedTcIds] = useState<string[]>([]);

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['test-plans', projectId],
    queryFn: () => testPlansApi.list(projectId!),
    refetchInterval: 8000,
  });
  const plans: any[] = plansData?.data?.items || [];

  const { data: suitesData } = useQuery({
    queryKey: ['suites', projectId],
    queryFn: () => suitesApi.list(projectId!),
    enabled: showForm,
  });
  const suites: any[] = suitesData?.data?.suites || [];

  const tcQueries = useQuery({
    queryKey: ['all-testcases-for-plan', projectId, suites.map(s => s.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(suites.map(s => testcasesApi.list(s.id)));
      return suites.map((s, i) => ({ suite: s, testcases: results[i]?.data?.test_cases || [] }));
    },
    enabled: showForm && suites.length > 0,
  });
  const suiteGroups: any[] = tcQueries.data || [];

  const { data: latestRun, refetch: refetchRun } = useQuery({
    queryKey: ['plan-latest-run', expandedPlan],
    queryFn: () => testPlansApi.latestRun(expandedPlan!),
    enabled: !!expandedPlan,
    refetchInterval: expandedPlan ? 3000 : false,
  });
  const runData = latestRun?.data?.data;

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token) return;
    const socket = socketIo(API_BASE, { auth: { token } });
    socket.on('exec:finished', () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      if (expandedPlan) refetchRun();
    });
    socket.on('plan:started', () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      if (expandedPlan) refetchRun();
    });
    return () => { socket.disconnect(); };
  }, [qc, projectId, expandedPlan, refetchRun]);

  const create = useMutation({
    mutationFn: () => testPlansApi.create({
      name: form.name,
      description: form.description || undefined,
      project_id: projectId,
      test_case_ids: Array.from(selectedTcIds),
      max_parallel: form.max_parallel,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      toast.success('Plano criado com sucesso');
      setShowForm(false);
      setForm({ name: '', description: '', max_parallel: 1 });
      setSelectedTcIds(new Set());
    },
    onError: () => toast.error('Erro ao criar plano'),
  });

  const runPlan = useMutation({
    mutationFn: (id: string) => testPlansApi.run(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      toast.success('Execução iniciada');
      setExpandedPlan(id);
    },
    onError: () => toast.error('Erro ao iniciar execução'),
  });

  const retryPlan = useMutation({
    mutationFn: (id: string) => testPlansApi.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      toast.success('Re-executando casos com falha');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Nenhuma falha para re-executar'),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, test_case_ids }: { id: string; test_case_ids: string[] }) =>
      testPlansApi.update(id, { test_case_ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      setShowTcOrder(null);
      toast.success('Ordem dos casos atualizada');
    },
    onError: () => toast.error('Erro ao reordenar casos'),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => testPlansApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      toast.success('Plano removido');
    },
    onError: () => toast.error('Erro ao remover plano'),
  });

  const toggleTc = (tcId: string) => {
    setSelectedTcIds(prev => {
      const n = new Set(prev);
      n.has(tcId) ? n.delete(tcId) : n.add(tcId);
      return n;
    });
  };

  const openTcOrder = (plan: any) => {
    const ids: string[] = plan.test_case_ids || [];
    setOrderedTcIds([...ids]);
    setShowTcOrder(plan.id);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return;
    const next = [...orderedTcIds];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setOrderedTcIds(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const toggleSuiteAll = (testcases: any[]) => {
    const ids = testcases.map((tc: any) => tc.id);
    const allSelected = ids.every(id => selectedTcIds.has(id));
    setSelectedTcIds(prev => {
      const n = new Set(prev);
      if (allSelected) { ids.forEach(id => n.delete(id)); }
      else { ids.forEach(id => n.add(id)); }
      return n;
    });
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <ClipboardList className="w-5 h-5 text-blue-400" /> Test Plans
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Agrupe e execute múltiplos casos de teste em lote
            </p>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2 text-sm"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-5 space-y-4 border-blue-500/20" style={{ borderColor: 'var(--primary)', borderWidth: 1 }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Novo Test Plan</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Nome *</label>
              <input
                className="input w-full"
                placeholder="Ex: Smoke Test — Produção"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Paralelos simultâneos</label>
              <select className="input w-full" value={form.max_parallel} onChange={e => setForm(f => ({ ...f, max_parallel: Number(e.target.value) }))}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} agente{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Descrição</label>
            <input
              className="input w-full"
              placeholder="Opcional"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* TC selector */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              Casos de Teste *
              {selectedTcIds.size > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400">{selectedTcIds.size} selecionados</span>
              )}
            </label>
            {tcQueries.isLoading ? (
              <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando casos de teste...
              </div>
            ) : suiteGroups.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Nenhuma suite encontrada neste projeto</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {suiteGroups.map(({ suite, testcases }) => (
                  testcases.length === 0 ? null : (
                    <div key={suite.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={testcases.every((tc: any) => selectedTcIds.has(tc.id))}
                          onChange={() => toggleSuiteAll(testcases)}
                        />
                        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{suite.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({testcases.length})</span>
                      </label>
                      <div className="space-y-1 pl-5">
                        {testcases.map((tc: any) => (
                          <label key={tc.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectedTcIds.has(tc.id)}
                              onChange={() => toggleTc(tc.id)}
                            />
                            <span className="text-xs truncate" style={{ color: 'var(--text)' }}>{tc.title}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              className="btn-primary flex items-center gap-2 text-sm"
              disabled={!form.name.trim() || selectedTcIds.size === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar Plano
            </button>
            <button className="btn-ghost text-sm" onClick={() => { setShowForm(false); setSelectedTcIds(new Set()); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Plans list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse" style={{ background: 'var(--surface-2)' }} />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>Nenhum plano criado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Crie um Test Plan para executar múltiplos casos de teste de uma vez
          </p>
          <button className="btn-primary mt-4 text-sm flex items-center gap-2 mx-auto" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Criar primeiro plano
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan: any) => {
            const isExpanded = expandedPlan === plan.id;
            const tcCount = plan.test_case_ids?.length || 0;
            const isRunning = runningPlan(plan);

            return (
              <div key={plan.id} className="card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{plan.name}</h3>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                          {tcCount} caso{tcCount !== 1 ? 's' : ''}
                        </span>
                        {plan.max_parallel > 1 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                            {plan.max_parallel}x paralelo
                          </span>
                        )}
                        {isRunning && (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Executando...
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{plan.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {plan.last_run_at && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Último run: {formatDate(plan.last_run_at)}
                          </span>
                        )}
                        {plan.last_run_status && (
                          <span className={`text-xs font-medium ${
                            plan.last_run_status === 'passed' ? 'text-green-400' :
                            plan.last_run_status === 'failed' ? 'text-red-400' :
                            plan.last_run_status === 'error' ? 'text-orange-400' : 'text-slate-400'
                          }`}>
                            {plan.last_run_status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'var(--primary)', color: '#fff' }}
                        disabled={runPlan.isPending}
                        onClick={() => runPlan.mutate(plan.id)}
                        title="Executar plano"
                      >
                        {runPlan.isPending && runPlan.variables === plan.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />}
                        Executar
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-amber-500/10"
                        title="Re-executar falhos"
                        disabled={retryPlan.isPending}
                        onClick={() => retryPlan.mutate(plan.id)}
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {retryPlan.isPending && retryPlan.variables === plan.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 hover:text-blue-400"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => openTcOrder(plan)}
                        title="Reordenar casos de teste"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                        title={isExpanded ? 'Fechar' : 'Ver detalhes'}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-400"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => { if (confirm(`Remover plano "${plan.name}"?`)) deletePlan.mutate(plan.id); }}
                        title="Remover plano"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: latest run progress */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Último Lote</span>
                      <button className="p-1 rounded hover:opacity-70 transition-opacity" onClick={() => refetchRun()} title="Atualizar">
                        <RefreshCw className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>

                    {!runData ? (
                      <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                        Nenhuma execução encontrada para este plano
                      </p>
                    ) : (
                      <>
                        {/* Stats row */}
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {[
                            { label: 'Total', value: runData.total, color: 'var(--text)' },
                            { label: 'Passou', value: runData.passed, color: '#10b981' },
                            { label: 'Falhou', value: runData.failed, color: '#ef4444' },
                            { label: 'Erro', value: runData.error, color: '#f59e0b' },
                            { label: 'Rodando', value: runData.running, color: '#3b82f6' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="text-center rounded-lg p-2" style={{ background: 'var(--surface-2)' }}>
                              <p className="text-base font-bold" style={{ color }}>{value || 0}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Progresso</span>
                            <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{runData.progress_pct}%</span>
                          </div>
                          <PlanProgressBar {...runData} />
                        </div>

                        {/* Execution list */}
                        {runData.executions?.length > 0 && (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {runData.executions.map((exec: any) => (
                              <div
                                key={exec.id}
                                className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors"
                                style={{ background: 'transparent' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                onClick={() => navigate(`/executions/${exec.id}`)}
                              >
                                <StatusIcon status={exec.status} />
                                <span className="flex-1 text-xs truncate" style={{ color: 'var(--text)' }}>
                                  {exec.tc_title || exec.id.slice(0, 8)}
                                </span>
                                {exec.agent_name && (
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{exec.agent_name}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* TC Reorder Modal */}
      {showTcOrder && (() => {
        const plan = plans.find(p => p.id === showTcOrder);
        if (!plan) return null;
        const tcMeta: Record<string, string> = {};
        (plan.tc_titles || []).forEach((t: any) => { if (t.id) tcMeta[t.id] = t.title; });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTcOrder(null)}>
            <div className="card p-5 w-full max-w-md mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={e => e.stopPropagation()}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Reordenar Casos de Teste</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{plan.name} · arraste para reordenar</p>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {orderedTcIds.map((tcId, i) => (
                  <div
                    key={tcId}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab select-none transition-all ${
                      dragIdx === i ? 'opacity-40' : dragOverIdx === i ? 'ring-1 ring-blue-400' : ''
                    }`}
                    style={{ background: 'var(--surface-3)' }}
                  >
                    <GripVertical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>
                      {tcMeta[tcId] || tcId.slice(0, 8)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  className="btn-primary flex-1 text-sm flex items-center gap-2 justify-center"
                  disabled={updatePlan.isPending}
                  onClick={() => updatePlan.mutate({ id: showTcOrder, test_case_ids: orderedTcIds })}
                >
                  {updatePlan.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListOrdered className="w-3.5 h-3.5" />}
                  Salvar Ordem
                </button>
                <button className="btn-ghost text-sm" onClick={() => setShowTcOrder(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function runningPlan(plan: any): boolean {
  return plan.last_run_status === 'running' || plan.last_run_status === 'queued';
}
