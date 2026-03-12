import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testcasesApi, executionsApi } from '../lib/api';
import { formatDate, formatDuration, statusBadgeClass } from '../lib/utils';
import {
  ArrowLeft, Plus, Trash2, Play, Save, GripVertical, Loader2,
  Globe, MousePointer, Type, Eye, Camera, Clock, Code, CheckSquare,
  AlertCircle, ChevronDown, ChevronUp, X, History, RotateCcw, Tag,
  CheckCircle2, XCircle, ExternalLink, Zap
} from 'lucide-react';

/* ── Step catalog ───────────────────────────────────────────────── */
const STEP_CATALOG = [
  {
    group: 'Navegação',
    items: [
      { type: 'goto', label: 'Abrir URL', icon: Globe, color: 'blue',
        fields: [{ key: 'url', label: 'URL', placeholder: 'https://exemplo.com', type: 'text' }],
        summary: (p: any) => p.url || 'URL não definida' },
    ],
  },
  {
    group: 'Interação',
    items: [
      { type: 'click', label: 'Clique', icon: MousePointer, color: 'violet',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'button, #id, .classe', type: 'text' }],
        summary: (p: any) => p.selector || 'seletor não definido' },
      { type: 'fill', label: 'Preencher Campo', icon: Type, color: 'cyan',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' },
          { key: 'value', label: 'Valor', placeholder: 'texto a preencher', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'wait_ms', label: 'Aguardar', icon: Clock, color: 'amber',
        fields: [{ key: 'ms', label: 'Milissegundos', placeholder: '1000', type: 'number' }],
        summary: (p: any) => `${p.ms || 1000}ms` },
      { type: 'hover', label: 'Hover', icon: MousePointer, color: 'violet',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.menu-item', type: 'text' }],
        summary: (p: any) => `hover em ${p.selector || '?'}` },
      { type: 'double_click', label: 'Duplo Clique', icon: MousePointer, color: 'violet',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.item', type: 'text' }],
        summary: (p: any) => `duplo clique em ${p.selector || '?'}` },
      { type: 'select_option', label: 'Selecionar Opção', icon: CheckSquare, color: 'cyan',
        fields: [
          { key: 'selector', label: 'Seletor do select', placeholder: 'select#estado', type: 'text' },
          { key: 'value', label: 'Valor', placeholder: 'SP', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'clear', label: 'Limpar Campo', icon: Type, color: 'cyan',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' }],
        summary: (p: any) => `limpar ${p.selector || '?'}` },
      { type: 'keyboard', label: 'Tecla do Teclado', icon: Code, color: 'amber',
        fields: [
          { key: 'key', label: 'Tecla', placeholder: 'Enter, Tab, Escape, ArrowDown', type: 'text' },
        ],
        summary: (p: any) => `tecla ${p.key || '?'}` },
      { type: 'scroll', label: 'Rolar Página', icon: Globe, color: 'blue',
        fields: [
          { key: 'selector', label: 'Seletor (opcional)', placeholder: 'body, .container', type: 'text' },
          { key: 'direction', label: 'Direção', placeholder: 'down', type: 'select', options: ['down','up','bottom','top'] },
        ],
        summary: (p: any) => `scroll ${p.direction || 'down'} em ${p.selector || 'página'}` },
    ],
  },
  {
    group: 'Verificações',
    items: [
      { type: 'expect_visible', label: 'Verificar Visível', icon: Eye, color: 'green',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'h1, .titulo', type: 'text' }],
        summary: (p: any) => `${p.selector || '?'} visível` },
      { type: 'expect_hidden', label: 'Verificar Oculto', icon: Eye, color: 'yellow',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.loading-spinner', type: 'text' }],
        summary: (p: any) => `${p.selector || '?'} oculto` },
      { type: 'expect_text', label: 'Verificar Texto', icon: CheckSquare, color: 'emerald',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'h1', type: 'text' },
          { key: 'text', label: 'Texto esperado', placeholder: 'Bem-vindo', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} contém "${p.text || ''}"` },
      { type: 'expect_value', label: 'Verificar Valor', icon: CheckSquare, color: 'emerald',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' },
          { key: 'value', label: 'Valor esperado', placeholder: 'usuario@email.com', type: 'text' },
        ],
        summary: (p: any) => `valor de ${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'assert_url', label: 'Verificar URL', icon: Globe, color: 'blue',
        fields: [{ key: 'url', label: 'URL esperada (contém)', placeholder: '/dashboard', type: 'text' }],
        summary: (p: any) => `URL contém "${p.url || '?'}"` },
      { type: 'assert_title', label: 'Verificar Título da Página', icon: Globe, color: 'blue',
        fields: [{ key: 'title', label: 'Título esperado (contém)', placeholder: 'Minha App', type: 'text' }],
        summary: (p: any) => `título contém "${p.title || '?'}"` },
      { type: 'wait_for', label: 'Aguardar Elemento', icon: AlertCircle, color: 'yellow',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.loading-done', type: 'text' }],
        summary: (p: any) => `aguarda ${p.selector || '?'}` },
      { type: 'wait_for_url', label: 'Aguardar URL', icon: Clock, color: 'amber',
        fields: [{ key: 'url', label: 'URL esperada (contém)', placeholder: '/success', type: 'text' }],
        summary: (p: any) => `aguarda URL "${p.url || '?'}"` },
    ],
  },
  {
    group: 'Mídia & API',
    items: [
      { type: 'screenshot', label: 'Capturar Tela', icon: Camera, color: 'pink',
        fields: [{ key: 'filename', label: 'Nome do arquivo', placeholder: 'captura.png', type: 'text' }],
        summary: (p: any) => p.filename || 'screenshot.png' },
      { type: 'api_call', label: 'Chamada API', icon: Code, color: 'orange',
        fields: [
          { key: 'method', label: 'Método', placeholder: 'GET', type: 'select', options: ['GET','POST','PUT','DELETE','PATCH'] },
          { key: 'url', label: 'URL', placeholder: 'https://api.exemplo.com/v1/recurso', type: 'text' },
          { key: 'body', label: 'Body JSON (opcional)', placeholder: '{"key":"value"}', type: 'text' },
        ],
        summary: (p: any) => `${p.method || 'GET'} ${p.url || '?'}` },
    ],
  },
];

const ALL_STEP_TYPES = STEP_CATALOG.flatMap(g => g.items);
function getStepMeta(type: string) {
  return ALL_STEP_TYPES.find(s => s.type === type) || null;
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  green: 'bg-green-500/10 border-green-500/30 text-green-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  pink: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
  orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
};

/* ── Main component ─────────────────────────────────────────────── */
export default function TestCaseEditorPage() {
  const { suiteId, tcId } = useParams<{ suiteId: string; tcId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['tc', suiteId, tcId],
    queryFn: () => testcasesApi.get(suiteId!, tcId!),
  });
  const tc = data?.data?.test_case;

  const [steps, setSteps] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showCatalog, setShowCatalog] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runVideo, setRunVideo] = useState(false);
  const [runScreenshot, setRunScreenshot] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showExecHistory, setShowExecHistory] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagsInitialized, setTagsInitialized] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestUrl, setSuggestUrl] = useState('');
  const [suggestGoal, setSuggestGoal] = useState('');
  const [suggestionResult, setSuggestionResult] = useState<any | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<{ version: any; vNum: number } | null>(null);

  if (tc && !initialized) {
    const parsed = typeof tc.steps === 'string' ? JSON.parse(tc.steps || '[]') : (tc.steps || []);
    setSteps(parsed.map((s: any, i: number) => ({ ...s, _id: i })));
    setInitialized(true);
  }

  if (tc && !tagsInitialized) {
    const parsedTags = typeof tc.tags === 'string' ? JSON.parse(tc.tags || '[]') : (tc.tags || []);
    setTags(parsedTags);
    setTagsInitialized(true);
  }

  const { data: execHistoryData } = useQuery({
    queryKey: ['tc-exec-history', tcId],
    queryFn: () => executionsApi.list({ test_case_id: tcId, limit: 20 }),
    enabled: showExecHistory,
  });
  const execHistory: any[] = execHistoryData?.data?.executions || [];

  const flakiness = (() => {
    if (execHistory.length < 5) return null;
    const last10 = execHistory.slice(0, 10);
    let switches = 0;
    for (let i = 1; i < last10.length; i++) {
      const prev = last10[i - 1].status;
      const curr = last10[i].status;
      const prevFinal = prev === 'passed';
      const currFinal = curr === 'passed';
      if (prevFinal !== currFinal) switches++;
    }
    return switches / (last10.length - 1);
  })();

  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ['tc-versions', suiteId, tcId],
    queryFn: () => testcasesApi.versions(suiteId!, tcId!),
    enabled: showHistory,
  });
  const versions: any[] = versionsData?.data?.versions || [];

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (tag && !tags.includes(tag)) {
      const next = [...tags, tag];
      setTags(next);
      setDirty(true);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => testcasesApi.update(suiteId!, tcId!, {
      title: tc?.title || 'Sem título',
      description: tc?.description || '',
      steps: steps.map((s, i) => ({ ...s, order: i + 1, _id: undefined })),
      tags,
      priority: tc?.priority || 'medium',
      status: tc?.status || 'active',
      type: tc?.type || 'web',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tc'] }); setDirty(false); toast.success('Steps salvos com sucesso'); },
    onError: () => toast.error('Erro ao salvar steps'),
  });

  const runExec = useMutation({
    mutationFn: () => executionsApi.create({
      test_case_id: tcId!,
      browsers: ['chromium'],
      video_enabled: runVideo,
      screenshot_enabled: runScreenshot,
      timeout: 60000,
    }),
    onSuccess: (res) => navigate(`/executions/${res.data.execution.id}`),
  });

  const suggestSteps = useMutation({
    mutationFn: () => testcasesApi.suggestSteps(suiteId!, tcId!, {
      url: suggestUrl.trim(),
      goal: suggestGoal.trim() || undefined,
    }),
    onSuccess: (res) => {
      setSuggestionResult(res.data);
      toast.success(res.data.cached ? 'Sugestões carregadas do cache' : 'Sugestões geradas com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Erro ao analisar a URL');
    },
  });

  const addStep = useCallback((type: string) => {
    const meta = getStepMeta(type);
    if (!meta) return;
    const params: any = {};
    for (const f of meta.fields) params[f.key] = f.type === 'number' ? '1000' : '';
    const newStep = { type, order: steps.length + 1, params, _id: Date.now() };
    setSteps(prev => [...prev, newStep]);
    setExpandedIdx(steps.length);
    setDirty(true);
    // keep catalog open so user can add more steps
  }, [steps.length]);

  const updateParam = (idx: number, key: string, value: string) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, params: { ...s.params, [key]: value } } : s));
    setDirty(true);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setExpandedIdx(null);
    setDirty(true);
  };

  const moveStep = (from: number, to: number) => {
    setSteps(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    setDirty(true);
  };

  const applySuggestedSteps = (mode: 'append' | 'replace') => {
    const suggested: any[] = suggestionResult?.suggestedSteps || [];
    if (suggested.length === 0) return;
    const normalized = suggested.map((step: any, idx: number) => {
      const meta = getStepMeta(step.type);
      const baseParams: any = {};
      if (meta) {
        for (const f of meta.fields) baseParams[f.key] = f.type === 'number' ? '1000' : '';
      }
      const mergedParams = { ...baseParams, ...(step.params || {}) };
      return {
        type: step.type,
        order: mode === 'replace' ? idx + 1 : steps.length + idx + 1,
        params: mergedParams,
        _id: Date.now() + idx,
      };
    }).filter((s: any) => getStepMeta(s.type) !== null);
    if (normalized.length === 0) {
      toast.error('Nenhum step sugerido é compatível com o catálogo de estações');
      return;
    }
    setSteps(prev => mode === 'replace' ? normalized : [...prev, ...normalized]);
    setExpandedIdx(0);
    setDirty(true);
    setShowSuggestModal(false);
    toast.info(mode === 'replace'
      ? `Fluxo substituído com ${normalized.length} estações sugeridas`
      : `${normalized.length} estações adicionadas ao fluxo`);
  };

  // Drag handlers
  const onDragStart = (idx: number) => setDragIdx(idx);
  const onDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const onDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) moveStep(dragIdx, idx);
    setDragIdx(null); setDragOverIdx(null);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>{tc?.title || '...'}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{steps.length} step{steps.length !== 1 ? 's' : ''} • Editor No-Code</p>
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
            {flakiness !== null && flakiness > 0.3 && (
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-2.5 h-2.5" /> Flaky
              </span>
            )}
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onClick={() => { setShowSuggestModal(true); setSuggestionResult(null); }}
          title="Gerar sugestão inteligente"
        >
          <Zap className="w-3.5 h-3.5" />
          Sugerir
        </button>
        {showSuggestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="rounded-xl border w-full max-w-md shadow-2xl flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)', maxHeight: '90vh' }}>
              <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Sugestão Inteligente de Estações</span>
                </div>
                <button onClick={() => { setShowSuggestModal(false); setSuggestionResult(null); }} className="btn-ghost p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Informe a URL que deseja testar. O sistema irá analisar a página e sugerir um fluxo de estações automaticamente.</p>
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>URL da página *</label>
                  <input
                    className="input w-full text-sm"
                    placeholder="https://exemplo.com/login"
                    value={suggestUrl}
                    onChange={e => setSuggestUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && suggestUrl.trim() && !suggestSteps.isPending && suggestSteps.mutate()}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Objetivo (opcional)</label>
                  <input
                    className="input w-full text-sm"
                    placeholder="Ex: fazer login e chegar no dashboard"
                    value={suggestGoal}
                    onChange={e => setSuggestGoal(e.target.value)}
                  />
                </div>
                <button
                  className="btn-primary w-full flex items-center justify-center gap-2"
                  disabled={suggestSteps.isPending || !suggestUrl.trim()}
                  onClick={() => suggestSteps.mutate()}
                >
                  {suggestSteps.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {suggestSteps.isPending ? 'Analisando página...' : 'Gerar sugestões'}
                </button>

                {suggestionResult && (
                  <div className="space-y-3 pt-1">
                    <div className="rounded-lg p-3 border space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {suggestionResult.analysis?.title || 'Análise concluída'}
                        </p>
                        {suggestionResult.cached && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">cache</span>
                        )}
                      </div>
                      {suggestionResult.analysis?.description && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{suggestionResult.analysis.description}</p>
                      )}
                    </div>

                    {!!suggestionResult.suggestedSteps?.length && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Fluxo sugerido ({suggestionResult.suggestedSteps.length} estações)</p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {suggestionResult.suggestedSteps.map((step: any, idx: number) => {
                            const meta = getStepMeta(step.type);
                            const Icon = meta?.icon;
                            const colorClass = meta ? (COLOR_MAP[meta.color] || COLOR_MAP.blue) : 'bg-slate-500/10 border-slate-500/30 text-slate-400';
                            return (
                              <div key={`${step.type}-${idx}`} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 border" style={{ borderColor: 'var(--border)' }}>
                                {Icon && (
                                  <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border mt-0.5 ${colorClass}`}>
                                    <Icon className="w-3 h-3" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-medium" style={{ color: meta ? 'var(--text)' : 'var(--text-muted)' }}>
                                    {idx + 1}. {meta?.label || step.type}
                                    {!meta && <span className="ml-1 text-amber-400">(tipo desconhecido)</span>}
                                  </p>
                                  {step.rationale && (
                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.rationale}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {suggestionResult?.suggestedSteps?.length > 0 && (
                <div className="flex gap-2 px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                  <button className="btn-primary flex-1 text-sm" onClick={() => applySuggestedSteps('append')}>
                    + Adicionar ao fluxo
                  </button>
                  <button
                    className="btn-ghost flex-1 text-sm border"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => {
                      if (steps.length > 0) {
                        setShowRestoreConfirm({ version: null, vNum: -1 });
                      } else {
                        applySuggestedSteps('replace');
                      }
                    }}
                  >
                    Substituir tudo
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {dirty && <span className="text-xs text-amber-400 font-medium">● não salvo</span>}
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors relative"
          style={showExecHistory
            ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
            : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onClick={() => { setShowExecHistory(h => !h); setShowHistory(false); setShowCatalog(false); }}
          title="Histórico de execuções"
        >
          {flakiness !== null && flakiness > 0.3 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
          )}
          <Zap className="w-3.5 h-3.5" />
          Runs
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onClick={() => { setShowHistory(h => !h); setShowExecHistory(false); setShowCatalog(false); if (!showHistory) refetchVersions(); }}
          title="Histórico de versões"
        >
          <History className="w-3.5 h-3.5" />
          {!showHistory ? 'Versões' : 'Fechar'}
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          onClick={() => save.mutate()}
          disabled={save.isPending || !dirty}
        >
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          onClick={() => setShowRunModal(true)}
        >
          <Play className="w-3.5 h-3.5" /> Executar
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Catalog sidebar – LEFT */}
        {showCatalog && (
          <div className="w-64 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Estações</span>
              <button onClick={() => setShowCatalog(false)} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {STEP_CATALOG.map(group => (
                <div key={group.group}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>{group.group}</p>
                  <div className="space-y-0.5">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const colorClass = COLOR_MAP[item.color] || COLOR_MAP.blue;
                      return (
                        <button
                          key={item.type}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left group"
                          style={{ color: 'var(--text)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => addStep(item.type)}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{item.label}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.summary({})}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {steps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-blue-400" />
              </div>
              <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Nenhum step ainda</p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Adicione estações para montar sua automação</p>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => setShowCatalog(true)}
              >
                <Plus className="w-4 h-4" /> Adicionar Estação
              </button>
            </div>
          )}

          {steps.map((step, idx) => {
            const meta = getStepMeta(step.type);
            if (!meta) return null;
            const Icon = meta.icon;
            const colorClass = COLOR_MAP[meta.color] || COLOR_MAP.blue;
            const isExpanded = expandedIdx === idx;
            const isDragTarget = dragOverIdx === idx;

            return (
              <div
                key={step._id ?? idx}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                className={`card border rounded-xl overflow-hidden transition-all ${isDragTarget ? 'border-blue-500/60 shadow-lg shadow-blue-500/10' : ''} ${dragIdx === idx ? 'opacity-50' : ''}`}
              >
                {/* Step header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
                    onMouseDown={e => e.stopPropagation()}>
                    <GripVertical className="w-4 h-4" />
                  </div>

                  <span className="text-xs font-mono text-slate-600 w-5 flex-shrink-0">{idx + 1}</span>

                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${colorClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{meta.label}</span>
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{meta.summary(step.params || {})}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 text-slate-600 transition-colors"
                      onClick={e => { e.stopPropagation(); removeStep(idx); }}
                      title="Remover step"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {idx > 0 && (
                      <button className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"
                        onClick={e => { e.stopPropagation(); moveStep(idx, idx - 1); }}
                        title="Mover para cima">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {idx < steps.length - 1 && (
                      <button className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"
                        onClick={e => { e.stopPropagation(); moveStep(idx, idx + 1); }}
                        title="Mover para baixo">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-slate-600">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                </div>

                {/* Step params */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    {meta.fields.map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
                        {field.type === 'select' ? (
                          <select
                            className="input w-full text-sm"
                            value={step.params?.[field.key] || ''}
                            onChange={e => updateParam(idx, field.key, e.target.value)}
                          >
                            {(field as any).options?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className="input w-full text-sm font-mono"
                            type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={field.placeholder}
                            value={step.params?.[field.key] || ''}
                            onChange={e => updateParam(idx, field.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {steps.length > 0 && (
            <button
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-slate-500 hover:text-blue-400 hover:border-blue-500/50 transition-all text-sm"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => setShowCatalog(true)}
            >
              <Plus className="w-4 h-4" /> Adicionar Estação
            </button>
          )}
        </div>

        {/* Execution history sidebar */}
        {showExecHistory && (
          <div className="w-80 border-l flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Histórico de Execuções</span>
                {flakiness !== null && flakiness > 0.3 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Flaky</span>
                )}
              </div>
              <button onClick={() => setShowExecHistory(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>

            {/* Tags editor */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--text)' }}>
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                ref={tagInputRef}
                className="input w-full text-xs py-1"
                placeholder="Adicionar tag (Enter ou vírgula)"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                  if (e.key === 'Backspace' && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
                }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Ex: smoke, regression, login</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {execHistory.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhuma execução ainda
                </div>
              ) : (
                execHistory.map((exec: any) => (
                  <div
                    key={exec.id}
                    className="flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => window.open(`/executions/${exec.id}`, '_blank')}
                  >
                    {exec.status === 'passed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                    {exec.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                    {exec.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                    {(exec.status === 'running' || exec.status === 'queued') && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{formatDate(exec.created_at)}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {exec.agent_name || '—'}{exec.duration_ms ? ` · ${formatDuration(exec.duration_ms)}` : ''}
                      </p>
                    </div>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Version History sidebar */}
        {showHistory && (
          <div className="w-80 border-l flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Histórico de Versões</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {versions.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhuma versão salva
                </div>
              ) : (
                versions.map((v: any, i: number) => (
                  <div
                    key={v.version}
                    className="rounded-lg border p-3 space-y-1.5 hover:border-blue-500/40 transition-colors"
                    style={{ borderColor: 'var(--border)', background: i === 0 ? 'var(--sidebar-active-bg)' : 'var(--surface-2)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: i === 0 ? 'var(--sidebar-active-text)' : 'var(--text)' }}>
                        v{v.version} {i === 0 && <span className="ml-1 opacity-60">(atual)</span>}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(v.created_at)}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{v.comment || 'Sem comentário'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {Array.isArray(v.steps) ? v.steps.length : '?'} steps • {v.author_name || '—'}
                      </span>
                      {i !== 0 && (
                        <button
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                          style={{ background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active-text)' }}
                          title="Restaurar esta versão"
                          onClick={() => setShowRestoreConfirm({ version: v, vNum: v.version })}
                        >
                          <RotateCcw className="w-3 h-3" /> Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Inline add station button when catalog closed */}
      </div>

      {/* Restore / Replace confirm modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl border p-6 w-full max-w-sm shadow-2xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {showRestoreConfirm.vNum === -1 ? 'Substituir steps atuais?' : `Restaurar versão ${showRestoreConfirm.vNum}?`}
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              {showRestoreConfirm.vNum === -1
                ? 'Os steps atuais serão substituídos pelas estações sugeridas. Esta ação não pode ser desfeita (exceto salvando antes).'
                : 'Os steps atuais serão substituídos pelos da versão selecionada. Salve para confirmar a restauração.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                onClick={() => setShowRestoreConfirm(null)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                onClick={() => {
                  if (showRestoreConfirm.vNum === -1) {
                    setShowRestoreConfirm(null);
                    applySuggestedSteps('replace');
                  } else {
                    const v = showRestoreConfirm.version;
                    const parsed = typeof v.steps === 'string' ? JSON.parse(v.steps) : v.steps;
                    setSteps(parsed.map((s: any, idx: number) => ({ ...s, _id: idx })));
                    setDirty(true);
                    setShowHistory(false);
                    setShowRestoreConfirm(null);
                    toast.info(`Versão ${showRestoreConfirm.vNum} restaurada — salve para confirmar`);
                  }
                }}
              >
                {showRestoreConfirm.vNum === -1 ? 'Substituir' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Modal */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Executar Automação</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tc?.title}</p>
              </div>
              <button onClick={() => setShowRunModal(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            {dirty && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-300">Salve as alterações antes de executar para garantir que os steps atuais sejam usados.</p>
              </div>
            )}
            <div className="p-3 rounded-lg border space-y-1" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs text-slate-400"><span className="text-slate-300 font-medium">Steps:</span> {steps.length}</p>
              <p className="text-xs text-slate-400"><span className="text-slate-300 font-medium">Browser:</span> Chromium</p>
              <p className="text-xs text-slate-400"><span className="text-slate-300 font-medium">Vídeo:</span> {runVideo ? 'Habilitado' : 'Desabilitado'}</p>
              <p className="text-xs text-slate-400"><span className="text-slate-300 font-medium">Screenshot:</span> {runScreenshot ? 'Habilitado' : 'Desabilitado'}</p>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={runVideo} onChange={e => setRunVideo(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Gravar vídeo da execução</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={runScreenshot} onChange={e => setRunScreenshot(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Capturar screenshots automáticos</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowRunModal(false)}>Cancelar</button>
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
                onClick={() => { setShowRunModal(false); runExec.mutate(); }}
                disabled={runExec.isPending}
              >
                {runExec.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Executar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
