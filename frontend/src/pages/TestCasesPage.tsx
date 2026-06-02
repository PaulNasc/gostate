import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { projectsApi, suitesApi, testcasesApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Plus, Search, Loader2, Pencil, Trash2, X, FolderOpen, Layers,
  TestTube2, SlidersHorizontal, ArrowRight, CheckCircle2, Play
} from 'lucide-react';
import { useToast } from '../components/Toast';

export default function TestCasesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('');
  const [selectedSuiteFilter, setSelectedSuiteFilter] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalProjectId, setModalProjectId] = useState('');
  const [modalSuiteId, setModalSuiteId] = useState('');
  const [modalPriority, setModalPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [modalType, setModalType] = useState<'web' | 'api' | 'mobile' | 'mixed'>('web');

  // Queries
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list()
  });
  const projects = projectsData?.data?.projects || [];

  // Load suites dynamically for the filter
  const { data: filterSuitesData } = useQuery({
    queryKey: ['suites', selectedProjectFilter],
    queryFn: () => suitesApi.list(selectedProjectFilter),
    enabled: !!selectedProjectFilter
  });
  const filterSuites = filterSuitesData?.data?.suites || [];

  // Load suites dynamically for the creation modal
  const { data: modalSuitesData } = useQuery({
    queryKey: ['suites', modalProjectId],
    queryFn: () => suitesApi.list(modalProjectId),
    enabled: !!modalProjectId
  });
  const modalSuites = modalSuitesData?.data?.suites || [];

  // Load all test cases globally
  const { data: testCasesData, isLoading } = useQuery({
    queryKey: ['testCasesGlobal', selectedProjectFilter, selectedSuiteFilter, selectedPriority, selectedStatus, selectedType, search],
    queryFn: () => testcasesApi.listGlobal({
      projectId: selectedProjectFilter || undefined,
      suiteId: selectedSuiteFilter || undefined,
      priority: selectedPriority || undefined,
      status: selectedStatus || undefined,
      type: selectedType || undefined,
      search: search || undefined
    })
  });
  const testCases = testCasesData?.data?.test_cases || [];

  // Mutations
  const createTestCase = useMutation({
    mutationFn: () => {
      // Send steps in Canvas format directly
      const canvasSteps = {
        editorMode: 'canvas',
        nodes: [
          {
            id: 'start-node',
            type: 'webFlow',
            position: { x: 250, y: 100 },
            data: { url: 'https://example.com', steps: [] }
          }
        ],
        edges: []
      };

      return testcasesApi.create(modalSuiteId, {
        title: modalTitle,
        description: modalDesc,
        steps: canvasSteps,
        priority: modalPriority,
        type: modalType,
        status: 'active',
        tags: []
      });
    },
    onSuccess: (response) => {
      const newTc = response.data?.test_case;
      qc.invalidateQueries({ queryKey: ['testCasesGlobal'] });
      setShowModal(false);
      toast.success('Caso de Teste Canvas criado com sucesso');
      // Redirect to the canvas editor with the force canvas mode query parameter
      navigate(`/suites/${modalSuiteId}/testcases/${newTc.id}/editor?mode=canvas`);
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error || 'Erro ao criar caso de teste';
      toast.error(errMsg);
    }
  });

  const deleteTestCase = useMutation({
    mutationFn: ({ suiteId, tcId }: { suiteId: string; tcId: string }) =>
      testcasesApi.remove(suiteId, tcId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['testCasesGlobal'] });
      toast.success('Caso de teste excluído');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Erro ao excluir caso de teste');
    }
  });

  const handleOpenCreate = () => {
    setModalTitle('');
    setModalDesc('');
    setModalPriority('medium');
    setModalType('web');
    // Pre-fill with first project if available
    if (projects.length > 0) {
      setModalProjectId(projects[0].id);
    } else {
      setModalProjectId('');
    }
    setModalSuiteId('');
    setShowModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim() || !modalSuiteId) return;
    createTestCase.mutate();
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/10 text-red-500 border border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
      case 'medium': return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'draft': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Casos de Teste</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isLoading ? 'Carregando...' : `${testCases.length} caso(s) de teste encontrado(s)`}
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4" /> Novo Teste Canvas
        </button>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" style={{ background: 'var(--surface-1)' }}>
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input pl-9 w-full"
            placeholder="Buscar testes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Project Select */}
        <div>
          <select
            className="input w-full"
            value={selectedProjectFilter}
            onChange={(e) => {
              setSelectedProjectFilter(e.target.value);
              setSelectedSuiteFilter('');
            }}
          >
            <option value="">Todos os Projetos</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Suite Select */}
        <div>
          <select
            className="input w-full"
            value={selectedSuiteFilter}
            onChange={(e) => setSelectedSuiteFilter(e.target.value)}
            disabled={!selectedProjectFilter}
          >
            <option value="">Todas as Suítes</option>
            {filterSuites.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Priority Select */}
        <div>
          <select
            className="input w-full"
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
          >
            <option value="">Todas as Prioridades</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>

        {/* Status Select */}
        <div>
          <select
            className="input w-full"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">Todos os Status</option>
            <option value="active">Ativo</option>
            <option value="draft">Rascunho</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>

        {/* Type Select */}
        <div>
          <select
            className="input w-full"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="">Todos os Tipos</option>
            <option value="web">Web</option>
            <option value="api">API</option>
            <option value="mobile">Mobile</option>
            <option value="mixed">Misto</option>
          </select>
        </div>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      ) : testCases.length === 0 ? (
        <div className="card p-12 text-center" style={{ background: 'var(--surface-1)' }}>
          <TestTube2 className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="font-semibold text-lg" style={{ color: 'var(--text)' }}>Nenhum caso de teste encontrado</p>
          <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Crie um novo caso de teste no Canvas para começar a automatizar.</p>
          <button className="btn-primary flex items-center gap-2 mx-auto" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" /> Criar Teste Canvas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testCases.map((tc: any) => (
            <div
              key={tc.id}
              className="card p-5 hover:border-rose-500/40 transition-all group flex flex-col justify-between"
              style={{ background: 'var(--surface-1)' }}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{tc.title}</h3>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {tc.description || 'Sem descrição fornecida.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <button
                      className="p-1.5 rounded hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Editar caso de teste"
                      onClick={() => navigate(`/suites/${tc.suite_id}/testcases/${tc.id}/editor?mode=canvas`)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Excluir caso de teste"
                      onClick={() => {
                        if (confirm(`Excluir o caso de teste "${tc.title}"?`)) {
                          deleteTestCase.mutate({ suiteId: tc.suite_id, tcId: tc.id });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                    {tc.type.toUpperCase()}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getPriorityBadgeClass(tc.priority)}`}>
                    {tc.priority.toUpperCase()}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusBadgeClass(tc.status)}`}>
                    {tc.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <FolderOpen className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[100px]">{tc.project_name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate max-w-[100px]">{tc.suite_name}</span>
                  </div>
                </div>

                <button
                  className="flex items-center gap-1.5 font-semibold text-rose-500 hover:text-rose-400 transition-colors"
                  onClick={() => navigate(`/suites/${tc.suite_id}/testcases/${tc.id}/editor?mode=canvas`)}
                >
                  Abrir Canvas <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="card p-6 w-full max-w-md mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Criar Caso de Teste no Canvas</h3>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Project Select */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Projeto *</label>
                <select
                  required
                  className="input w-full"
                  value={modalProjectId}
                  onChange={(e) => {
                    setModalProjectId(e.target.value);
                    setModalSuiteId('');
                  }}
                >
                  <option value="" disabled>Selecione um projeto</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Suite Select */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Suíte *</label>
                <select
                  required
                  className="input w-full"
                  value={modalSuiteId}
                  onChange={(e) => setModalSuiteId(e.target.value)}
                  disabled={!modalProjectId}
                >
                  <option value="" disabled>Selecione uma suíte</option>
                  {modalSuites.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {modalProjectId && modalSuites.length === 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">Este projeto não tem nenhuma suíte de teste. Crie uma suíte primeiro.</p>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Título *</label>
                <input
                  type="text"
                  required
                  className="input w-full"
                  placeholder="Ex: Validar fluxo de cadastro"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Descrição</label>
                <textarea
                  className="input w-full resize-none"
                  rows={2}
                  placeholder="Explique o que este teste valida..."
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                />
              </div>

              {/* Priority & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Prioridade</label>
                  <select
                    className="input w-full"
                    value={modalPriority}
                    onChange={(e: any) => setModalPriority(e.target.value)}
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Tipo</label>
                  <select
                    className="input w-full"
                    value={modalType}
                    onChange={(e: any) => setModalType(e.target.value)}
                  >
                    <option value="web">Web</option>
                    <option value="api">API</option>
                    <option value="mobile">Mobile</option>
                    <option value="mixed">Misto</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button type="button" className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowModal(false)}>Cancelar</button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                  disabled={!modalTitle.trim() || !modalSuiteId || createTestCase.isPending}
                >
                  {createTestCase.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Criar e Abrir Canvas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
