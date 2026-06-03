import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scriptsApi, projectsApi, executionsApi, agentsApi } from '../lib/api';
import { formatDate, statusBadgeClass, statusLabel } from '../lib/utils';
import {
  Code2, Plus, Trash2, Play, Save, X, Loader2, FileCode,
  ChevronDown, RefreshCw, Video, Circle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { normalizeRecordedScript } from '../lib/scriptNormalizer';

const DEFAULT_SCRIPT = `const { test, expect } = require('@playwright/test');

test('Meu Teste', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Example Domain');
});
`;

export default function ScriptsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [selected, setSelected] = useState<any | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingScript, setPendingScript] = useState<any | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [showRunModal, setShowRunModal] = useState(false);
  const [runAgent, setRunAgent] = useState('');
  const [runBrowser, setRunBrowser] = useState('chromium');
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameVal, setFilenameVal] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recorderUrl, setRecorderUrl] = useState('https://');
  const [recorderProject, setRecorderProject] = useState('');
  const [recorderName, setRecorderName] = useState('');
  const [recorderPasted, setRecorderPasted] = useState('');
  const [recorderNormalize, setRecorderNormalize] = useState(true);
  const [recorderPreview, setRecorderPreview] = useState('');
  const [recorderChanges, setRecorderChanges] = useState<string[]>([]);
  const [runVideo, setRunVideo] = useState(false);
  const [runScreenshot, setRunScreenshot] = useState(true);

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });
  const projects: any[] = projectsData?.data?.projects || [];

  const [filterProject, setFilterProject] = useState('');

  const { data: scriptsData, isLoading } = useQuery({
    queryKey: ['scripts', filterProject],
    queryFn: () => scriptsApi.list(filterProject || undefined),
  });
  const scripts: any[] = scriptsData?.data?.scripts || [];

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });
  const agents: any[] = (agentsData?.data?.agents || []).filter((a: any) => a.status === 'online');

  const createScript = useMutation({
    mutationFn: (data: any) => scriptsApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['scripts'] });
      const s = res.data.script;
      setSelected(s);
      setEditorContent(s.content);
      setDirty(false);
      setShowNew(false);
      setNewName('');
    },
  });

  const updateScript = useMutation({
    mutationFn: ({ id, data }: any) => scriptsApi.update(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['scripts'] });
      setSelected(res.data.script);
      setDirty(false);
      setEditingFilename(false);
      toast.success('Script salvo');
    },
    onError: () => toast.error('Erro ao salvar script'),
  });

  function commitRenameFilename() {
    if (!selected || !filenameVal.trim()) { setEditingFilename(false); return; }
    const fn = filenameVal.trim().endsWith('.spec.js') || filenameVal.trim().endsWith('.test.js')
      ? filenameVal.trim() : `${filenameVal.trim()}.spec.js`;
    if (fn !== selected.filename) {
      updateScript.mutate({ id: selected.id, data: { filename: fn, content: editorContent } });
    } else {
      setEditingFilename(false);
    }
  }

  const deleteScript = useMutation({
    mutationFn: (id: string) => scriptsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts'] });
      setShowDeleteModal(false);
      setSelected(null);
      setEditorContent('');
      toast.success('Script excluído');
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Erro ao excluir script'),
  });

  const runScript = useMutation({
    mutationFn: (data: any) => executionsApi.create(data),
    onSuccess: (res) => {
      setShowRunModal(false);
      toast.success('Execução criada — redirecionando...');
      navigate(`/executions/${res.data.execution.id}`);
    },
    onError: () => toast.error('Erro ao criar execução'),
  });

  function selectScript(s: any) {
    if (dirty) {
      setPendingScript(s);
      setShowDiscardModal(true);
      return;
    }
    setSelected(s);
    setEditorContent(s.content);
    setDirty(false);
  }

  function confirmDiscard() {
    if (pendingScript) {
      setSelected(pendingScript);
      setEditorContent(pendingScript.content);
      setDirty(false);
      setPendingScript(null);
    }
    setShowDiscardModal(false);
  }

  function handleEditorChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setEditorContent(e.target.value);
    setDirty(true);
  }

  function handleSave() {
    if (!selected) return;
    updateScript.mutate({ id: selected.id, data: { content: editorContent } });
  }

  function handleDeleteScript() {
    if (!selected) return;
    deleteScript.mutate(selected.id);
  }

  function handleCreate() {
    if (!newName.trim() || !newProject) return;
    const filename = newName.trim().endsWith('.spec.js') ? newName.trim() : `${newName.trim()}.spec.js`;
    createScript.mutate({
      project_id: newProject,
      filename,
      content: DEFAULT_SCRIPT,
      framework: 'playwright',
      language: 'js',
    });
  }

  function handleRun() {
    if (!selected) return;
    runScript.mutate({
      script_id: selected.id,
      scriptContent: editorContent,
      browsers: [runBrowser],
      video_enabled: runVideo,
      screenshot_enabled: runScreenshot,
      timeout: 60000,
      ...(runAgent ? { agent_id: runAgent } : {}),
    });
  }

  function handleImportRecording() {
    if (!recorderPasted.trim() || !recorderName.trim() || !recorderProject) return;
    const filename = recorderName.trim().endsWith('.spec.js') ? recorderName.trim() : `${recorderName.trim()}.spec.js`;
    const normalized = recorderNormalize
      ? normalizeRecordedScript(recorderPasted.trim(), { testName: recorderName.trim() })
      : { content: recorderPasted.trim(), changes: [] as string[] };
    createScript.mutate(
      { project_id: recorderProject, filename, content: normalized.content, framework: 'playwright', language: 'js' },
      {
        onSuccess: () => {
          setShowRecorder(false);
          setRecorderPasted('');
          setRecorderName('');
          setRecorderPreview('');
          setRecorderChanges([]);
          toast.success(normalized.changes.length > 0 ? 'Script importado com melhorias automáticas' : 'Script de gravação importado!');
        },
      }
    );
  }

  function handleRecorderPasteChange(value: string) {
    setRecorderPasted(value);
    if (recorderNormalize && value.trim()) {
      const result = normalizeRecordedScript(value, { testName: recorderName.trim() });
      setRecorderPreview(result.content);
      setRecorderChanges(result.changes);
      return;
    }
    setRecorderPreview(value);
    setRecorderChanges([]);
  }

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Discard confirmation modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl border p-6 w-full max-w-sm shadow-2xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Alterações não salvas</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Há alterações não salvas neste script. Deseja descartá-las e abrir outro script?</p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                onClick={() => { setShowDiscardModal(false); setPendingScript(null); }}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                onClick={confirmDiscard}
              >
                Descartar e abrir
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-xl border p-6 w-full max-w-md shadow-2xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Excluir script</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Deseja excluir <span className="font-mono" style={{ color: 'var(--text)' }}>{selected.filename}</span>?
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  O histórico de execuções será preservado, mas o script deixará de aparecer na lista.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteScript.isPending}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center gap-2"
                onClick={handleDeleteScript}
                disabled={deleteScript.isPending}
              >
                {deleteScript.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Scripts</span>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => setShowRecorder(true)}
              title="Gravar com Playwright Recorder"
            >
              <Circle className="w-3.5 h-3.5 text-red-400" />
            </button>
            <button
              className="p-1.5 rounded hover:bg-black/10 transition-colors" style={{ color: 'var(--text-muted)' }}
              onClick={() => setShowNew(true)}
              title="Novo Script"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter by project */}
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <select
              className="w-full bg-transparent text-xs border border-transparent focus:outline-none appearance-none cursor-pointer" style={{ color: 'var(--text-muted)' }}
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
            >
              <option value="">Todos os projetos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-500 absolute right-0 top-0.5 pointer-events-none" />
          </div>
        </div>

        {/* Script list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
          ) : scripts.length === 0 ? (
            <div className="p-6 text-center">
              <FileCode className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text)' }}>Nenhum script</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Crie um script Playwright para executar testes customizados
              </p>
            </div>
          ) : (
            scripts.map(s => (
              <button
                key={s.id}
                className={`w-full text-left px-3 py-2.5 border-b text-xs transition-colors ${selected?.id === s.id
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'hover:bg-black/5'
                }`}
                style={{ borderColor: selected?.id === s.id ? undefined : 'var(--border)' }}
                onClick={() => selectScript(s)}
              >
                <div className="flex items-center gap-2">
                  <Code2 className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate font-mono">{s.filename}</span>
                </div>
                <p className="mt-0.5 text-xs pl-5" style={{ color: 'var(--text-muted)' }}>{formatDate(s.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <Code2 className="w-4 h-4 text-slate-500" />
              {editingFilename ? (
                <input
                  className="input flex-1 font-mono text-sm py-0.5 px-2 h-7"
                  value={filenameVal}
                  autoFocus
                  onChange={e => setFilenameVal(e.target.value)}
                  onBlur={commitRenameFilename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRenameFilename(); if (e.key === 'Escape') setEditingFilename(false); }}
                />
              ) : (
                <span
                  className="text-sm font-mono flex-1 cursor-pointer hover:text-blue-400 transition-colors" style={{ color: 'var(--text)' }}
                  title="Clique para renomear"
                  onClick={() => { setFilenameVal(selected.filename); setEditingFilename(true); }}
                >{selected.filename}</span>
              )}
              {dirty && <span className="text-xs text-amber-400 font-medium">● não salvo</span>}
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border hover:bg-black/5 transition-colors"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                onClick={handleSave}
                disabled={updateScript.isPending || !dirty}
              >
                {updateScript.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Salvar
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
                onClick={() => setShowRunModal(true)}
              >
                <Play className="w-3 h-3" /> Executar
              </button>
              <button
                className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => setShowDeleteModal(true)}
                title="Excluir script"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Code editor */}
            <div className="flex-1 relative" style={{ background: '#0a0f1a' }}>
              {/* Line numbers */}
              <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col pt-4 pb-4 text-right pr-2 select-none pointer-events-none" style={{ background: '#0a0f1a', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                {editorContent.split('\n').map((_, i) => (
                  <span key={i} className="text-xs leading-5 text-slate-700">{i + 1}</span>
                ))}
              </div>
              <textarea
                className="absolute inset-0 left-10 w-full h-full resize-none font-mono text-sm text-green-200 p-4 focus:outline-none"
                style={{ background: 'transparent', lineHeight: '1.25rem', caretColor: '#60a5fa', tabSize: 2 }}
                value={editorContent}
                onChange={handleEditorChange}
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    const newVal = editorContent.substring(0, start) + '  ' + editorContent.substring(end);
                    setEditorContent(newVal);
                    setDirty(true);
                    requestAnimationFrame(() => {
                      e.currentTarget.selectionStart = start + 2;
                      e.currentTarget.selectionEnd = start + 2;
                    });
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8" style={{ background: '#0a0f1a' }}>
            <Code2 className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">Selecione um script para editar</p>
            <p className="text-sm text-slate-600 mt-1">ou crie um novo clicando no <strong>+</strong> ao lado de Scripts</p>
          </div>
        )}
      </div>

      {/* Modal: Novo Script */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Novo Script</h3>
              <button onClick={() => setShowNew(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Projeto</label>
                <select
                  className="input w-full"
                  value={newProject}
                  onChange={e => setNewProject(e.target.value)}
                >
                  <option value="">Selecione um projeto...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome do arquivo</label>
                <input
                  className="input w-full font-mono"
                  placeholder="meu-teste.spec.js"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <p className="text-xs text-slate-600 mt-1">Deve terminar com .spec.js ou .test.js</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowNew(false)}>Cancelar</button>
              <button
                className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
                onClick={handleCreate}
                disabled={!newName.trim() || !newProject || createScript.isPending}
              >
                {createScript.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Playwright Recorder */}
      {showRecorder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Playwright Recorder</h3>
              </div>
              <button onClick={() => setShowRecorder(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>

            {/* Instructions */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Como gravar</p>
              <ol className="space-y-2">
                <li className="text-sm flex gap-2" style={{ color: 'var(--text)' }}>
                  <span className="text-blue-400 font-bold flex-shrink-0">1.</span>
                  <span>Abra um terminal e execute o comando abaixo para iniciar o gravador:</span>
                </li>
                <div className="font-mono text-xs rounded-lg px-3 py-2 select-all cursor-text flex items-center justify-between gap-2"
                  style={{ background: '#0a0f1a', border: '1px solid var(--border)', color: '#a3e635' }}>
                  <code>npx playwright codegen {recorderUrl !== 'https://' ? recorderUrl : 'https://sua-url.com'}</code>
                  <button
                    className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                    onClick={() => navigator.clipboard.writeText(`npx playwright codegen ${recorderUrl !== 'https://' ? recorderUrl : 'https://sua-url.com'}`)}
                    title="Copiar comando"
                  >
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </div>
                <li className="text-sm flex gap-2" style={{ color: 'var(--text)' }}>
                  <span className="text-blue-400 font-bold flex-shrink-0">2.</span>
                  <span>Realize as ações no browser. O Playwright gera o código automaticamente na janela do Recorder.</span>
                </li>
                <li className="text-sm flex gap-2" style={{ color: 'var(--text)' }}>
                  <span className="text-blue-400 font-bold flex-shrink-0">3.</span>
                  <span>Copie o código gerado e cole abaixo para importar como script.</span>
                </li>
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">URL alvo (para o comando)</label>
                <input
                  className="input w-full font-mono text-sm"
                  placeholder="https://sua-url.com"
                  value={recorderUrl}
                  onChange={e => setRecorderUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome do script</label>
                <input
                  className="input w-full font-mono"
                  placeholder="gravacao.spec.js"
                  value={recorderName}
                  onChange={e => setRecorderName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Projeto</label>
              <select className="input w-full" value={recorderProject} onChange={e => setRecorderProject(e.target.value)}>
                <option value="">Selecione um projeto...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cole o código gerado pelo Recorder</label>
              <textarea
                className="w-full h-40 font-mono text-xs rounded-xl px-3 py-2.5 resize-none outline-none"
                style={{ background: '#0a0f1a', border: '1px solid var(--border)', color: '#a3e635', lineHeight: '1.4' }}
                placeholder={`const { test, expect } = require('@playwright/test');

test('test', async ({ page }) => {
  // código gerado pelo playwright codegen...
});`}
                value={recorderPasted}
                onChange={e => handleRecorderPasteChange(e.target.value)}
                spellCheck={false}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recorderNormalize}
                onChange={e => {
                  const checked = e.target.checked;
                  setRecorderNormalize(checked);
                  if (checked && recorderPasted.trim()) {
                    const result = normalizeRecordedScript(recorderPasted, { testName: recorderName.trim() });
                    setRecorderPreview(result.content);
                    setRecorderChanges(result.changes);
                  } else {
                    setRecorderPreview(recorderPasted);
                    setRecorderChanges([]);
                  }
                }}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm" style={{ color: 'var(--text)' }}>Normalizar código automaticamente ao importar</span>
            </label>

            {(recorderChanges.length > 0 || recorderPreview) && (
              <div className="space-y-3">
                {recorderChanges.length > 0 && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Melhorias detectadas</p>
                    <div className="space-y-1">
                      {recorderChanges.map((change, idx) => (
                        <p key={`${change}-${idx}`} className="text-xs" style={{ color: 'var(--text)' }}>- {change}</p>
                      ))}
                    </div>
                  </div>
                )}
                {recorderPreview && recorderPreview !== recorderPasted && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Prévia normalizada</label>
                    <textarea
                      className="w-full h-36 font-mono text-xs rounded-xl px-3 py-2.5 resize-none outline-none"
                      style={{ background: '#0a0f1a', border: '1px solid var(--border)', color: '#93c5fd', lineHeight: '1.4' }}
                      value={recorderPreview}
                      readOnly
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowRecorder(false)}>Cancelar</button>
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
                onClick={handleImportRecording}
                disabled={!recorderPasted.trim() || !recorderName.trim() || !recorderProject || createScript.isPending}
              >
                {createScript.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
                Importar Gravação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Executar */}
      {showRunModal && selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Executar Script</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{selected.filename}</p>
              </div>
              <button onClick={() => setShowRunModal(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Agente</label>
                <select className="input w-full" value={runAgent} onChange={e => setRunAgent(e.target.value)}>
                  <option value="">Auto (qualquer disponível)</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} — online</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Browser</label>
                <select className="input w-full" value={runBrowser} onChange={e => setRunBrowser(e.target.value)}>
                  <option value="chromium">Chromium</option>
                  <option value="firefox">Firefox</option>
                  <option value="webkit">WebKit (Safari)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={runVideo} onChange={e => setRunVideo(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Gravar vídeo da execução</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={runScreenshot} onChange={e => setRunScreenshot(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Capturar screenshots automáticos</span>
              </label>
              {dirty && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300">O script será executado com as alterações não salvas</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setShowRunModal(false)}>Cancelar</button>
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
                onClick={handleRun}
                disabled={runScript.isPending}
              >
                {runScript.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Executar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
