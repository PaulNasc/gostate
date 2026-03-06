import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, suitesApi, testcasesApi, executionsApi, agentsApi } from '../lib/api';
import { formatDate, statusBadgeClass, statusLabel } from '../lib/utils';
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Trash2, TestTube2, Loader2, FolderOpen, Play, Pencil, PlayCircle, ClipboardList, Layers, Users } from 'lucide-react';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openSuites, setOpenSuites] = useState<Set<string>>(new Set());
  const [showSuiteForm, setShowSuiteForm] = useState(false);
  const [suiteName, setSuiteName] = useState('');
  const [showTcForm, setShowTcForm] = useState<string | null>(null);
  const [tcTitle, setTcTitle] = useState('');

  const { data: projData } = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId!) });
  const { data: suitesData, isLoading } = useQuery({ queryKey: ['suites', projectId], queryFn: () => suitesApi.list(projectId!) });

  const project = projData?.data?.project;
  const suites: any[] = suitesData?.data?.suites || [];

  const createSuite = useMutation({
    mutationFn: () => suitesApi.create(projectId!, { name: suiteName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suites', projectId] }); setShowSuiteForm(false); setSuiteName(''); },
  });

  const deleteSuite = useMutation({
    mutationFn: (id: string) => suitesApi.remove(projectId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suites', projectId] }),
  });

  const updateSuite = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => suitesApi.update(projectId!, id, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suites', projectId] }),
  });

  const createTc = useMutation({
    mutationFn: (suiteId: string) => testcasesApi.create(suiteId, { title: tcTitle, steps: [], tags: [] }),
    onSuccess: (_, suiteId) => { qc.invalidateQueries({ queryKey: ['testcases', suiteId] }); setShowTcForm(null); setTcTitle(''); },
  });

  const deleteTc = useMutation({
    mutationFn: ({ suiteId, tcId }: { suiteId: string; tcId: string }) => testcasesApi.remove(suiteId, tcId),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ['testcases', vars.suiteId] }),
  });

  const [runModal, setRunModal] = useState<{ tcId: string; title: string } | null>(null);
  const [runSuiteModal, setRunSuiteModal] = useState<{ suiteId: string; suiteName: string } | null>(null);

  const toggleSuite = (id: string) => {
    setOpenSuites(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/projects')} className="btn-ghost p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{project?.name || '...'}</h1>
          {project?.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{project.description}</p>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            onClick={() => navigate(`/projects/${projectId}/members`)}
          >
            <Users className="w-4 h-4" /> Membros
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            onClick={() => navigate(`/projects/${projectId}/environments`)}
          >
            <Layers className="w-4 h-4" /> Ambientes
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            onClick={() => navigate(`/projects/${projectId}/plans`)}
          >
            <ClipboardList className="w-4 h-4" /> Test Plans
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowSuiteForm(!showSuiteForm)}>
            <Plus className="w-4 h-4" /> Nova Suite
          </button>
        </div>
      </div>

      {showSuiteForm && (
        <div className="card p-4 flex gap-2">
          <input className="input flex-1" placeholder="Nome da suite *" value={suiteName} onChange={e => setSuiteName(e.target.value)} autoFocus />
          <button className="btn-primary flex items-center gap-1" disabled={!suiteName.trim() || createSuite.isPending} onClick={() => createSuite.mutate()}>
            {createSuite.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
          </button>
          <button className="btn-ghost" onClick={() => setShowSuiteForm(false)}>Cancelar</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : suites.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Nenhuma suite ainda</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Crie uma suite para organizar seus casos de teste</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suites.map((suite) => (
            <SuiteItem
              key={suite.id}
              suite={suite}
              open={openSuites.has(suite.id)}
              onToggle={() => toggleSuite(suite.id)}
              onDelete={() => { if (confirm('Excluir suite?')) deleteSuite.mutate(suite.id); }}
              showTcForm={showTcForm === suite.id}
              onShowTcForm={() => setShowTcForm(showTcForm === suite.id ? null : suite.id)}
              tcTitle={tcTitle}
              onTcTitle={setTcTitle}
              onCreateTc={() => createTc.mutate(suite.id)}
              onDeleteTc={(tcId: string) => { if (confirm('Excluir caso de teste?')) deleteTc.mutate({ suiteId: suite.id, tcId }); }}
              onRename={(id: string, name: string) => updateSuite.mutate({ id, name })}
              onRunTc={(tcId: string, title: string) => setRunModal({ tcId, title })}
              onRunSuite={() => setRunSuiteModal({ suiteId: suite.id, suiteName: suite.name })}
              onEditTc={(tcId: string) => navigate(`/suites/${suite.id}/testcases/${tcId}/editor`)}
              creating={createTc.isPending}
            />
          ))}
        </div>
      )}
      {runModal && (
        <RunModal
          tcId={runModal.tcId}
          title={runModal.title}
          onClose={() => setRunModal(null)}
        />
      )}
      {runSuiteModal && (
        <RunSuiteModal
          suiteId={runSuiteModal.suiteId}
          suiteName={runSuiteModal.suiteName}
          onClose={() => setRunSuiteModal(null)}
        />
      )}
    </div>
  );
}

function RunModal({ tcId, title, onClose }: { tcId: string; title: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const agents: any[] = (data?.data?.agents || []).filter((a: any) => a.status !== 'offline');
  const [agentId, setAgentId] = useState('');
  const [browsers, setBrowsers] = useState('chromium');
  const [video, setVideo] = useState(false);

  const run = useMutation({
    mutationFn: () => executionsApi.create({
      test_case_id: tcId,
      browsers: [browsers],
      video_enabled: video,
      timeout: 60000,
    }),
    onSuccess: (res) => { onClose(); navigate(`/executions/${res.data.execution.id}`); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card p-6 w-full max-w-md mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Disparar Execução</h3>
          <p className="text-sm mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{title}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Agente</label>
            <select className="input" value={agentId} onChange={e => setAgentId(e.target.value)}>
              <option value="">Auto (qualquer disponível)</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} — {a.status}</option>
              ))}
            </select>
            {agents.length === 0 && (
              <p className="text-xs text-yellow-400 mt-1">Nenhum agente online. Inicie um agente remoto primeiro.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Browser</label>
            <select className="input" value={browsers} onChange={e => setBrowsers(e.target.value)}>
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit (Safari)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={video} onChange={e => setVideo(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
            <span className="text-sm" style={{ color: 'var(--text)' }}>Gravar vídeo da execução</span>
          </label>
        </div>

        {run.isError && (
          <p className="text-xs text-red-400">{(run.error as any)?.response?.data?.error || 'Erro ao disparar execução'}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex items-center gap-2 flex-1 justify-center" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {run.isPending ? 'Disparando...' : 'Executar'}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function RunSuiteModal({ suiteId, suiteName, onClose }: { suiteId: string; suiteName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: agentsData } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const { data: tcsData } = useQuery({ queryKey: ['testcases', suiteId], queryFn: () => testcasesApi.list(suiteId) });
  const agents: any[] = (agentsData?.data?.agents || []).filter((a: any) => a.status !== 'offline');
  const tcs: any[] = tcsData?.data?.test_cases || [];
  const [browsers, setBrowsers] = useState('chromium');
  const [video, setVideo] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (tcs.length === 0) return;
    setRunning(true);
    setError('');
    const created: { id: string; title: string }[] = [];
    try {
      for (const tc of tcs) {
        const res = await executionsApi.create({
          test_case_id: tc.id,
          browsers: [browsers],
          video_enabled: video,
          timeout: 60000,
        });
        created.push({ id: res.data.execution.id, title: tc.title });
      }
      setResults(created);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao disparar execuções');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card p-6 w-full max-w-md mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Executar Suite</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{suiteName} · {tcs.length} caso{tcs.length !== 1 ? 's' : ''} de teste</p>
        </div>

        {results.length === 0 ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Browser</label>
                <select className="input" value={browsers} onChange={e => setBrowsers(e.target.value)}>
                  <option value="chromium">Chromium</option>
                  <option value="firefox">Firefox</option>
                  <option value="webkit">WebKit (Safari)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={video} onChange={e => setVideo(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Gravar vídeo das execuções</span>
              </label>
              {agents.length === 0 && (
                <p className="text-xs text-yellow-400">Nenhum agente online. Inicie um agente primeiro.</p>
              )}
              {tcs.length === 0 && (
                <p className="text-xs text-slate-500">Esta suite não possui casos de teste.</p>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary flex items-center gap-2 flex-1 justify-center"
                disabled={running || tcs.length === 0}
                onClick={handleRun}
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                {running ? 'Disparando...' : `Executar ${tcs.length} caso${tcs.length !== 1 ? 's' : ''}`}
              </button>
              <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{results.length} execução{results.length !== 1 ? 'ões' : ''} criadas:</p>
              {results.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:text-blue-400 transition-colors flex items-center gap-2"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { onClose(); navigate(`/executions/${r.id}`); }}
                >
                  <PlayCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  {r.title}
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>#{r.id.slice(0, 8)}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn-primary flex-1" onClick={() => { onClose(); navigate('/executions'); }}>Ver Execuções</button>
              <button className="btn-ghost" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuiteItem({ suite, open, onToggle, onDelete, onRename, showTcForm, onShowTcForm, tcTitle, onTcTitle, onCreateTc, onDeleteTc, onRunTc, onRunSuite, onEditTc, creating }: any) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['testcases', suite.id],
    queryFn: () => testcasesApi.list(suite.id),
    enabled: open,
  });
  const tcs: any[] = data?.data?.test_cases || [];
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(suite.name);

  const commitRename = () => {
    if (nameVal.trim() && nameVal.trim() !== suite.name) onRename(suite.id, nameVal.trim());
    setEditingName(false);
  };

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 transition-colors group"
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => !editingName && onToggle()}
        style={{ cursor: 'pointer' }}
      >
        <button className="flex-shrink-0" onClick={e => { e.stopPropagation(); onToggle(); }}>
          {open ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        </button>
        {editingName ? (
          <input
            className="input flex-1 text-sm py-0.5 px-2 h-7"
            value={nameVal}
            autoFocus
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameVal(suite.name); setEditingName(false); } }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="font-medium text-sm flex-1 cursor-pointer" style={{ color: 'var(--text)' }}>{suite.name}</span>
        )}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{suite.tc_count || 0} casos</span>
        <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-blue-500/10 hover:text-blue-400 transition-all" style={{ color: 'var(--text-muted)' }} title="Renomear suite" onClick={e => { e.stopPropagation(); setEditingName(true); setNameVal(suite.name); }}>
          <Pencil className="w-3 h-3" />
        </button>
        <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-green-500/10 hover:text-green-400 transition-all" style={{ color: 'var(--text-muted)' }} title="Executar suite inteira" onClick={e => { e.stopPropagation(); onRunSuite(); }}>
          <PlayCircle className="w-3.5 h-3.5" />
        </button>
        <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-emerald-500/10 hover:text-emerald-400 transition-all" style={{ color: 'var(--text-muted)' }} onClick={e => { e.stopPropagation(); onShowTcForm(); }}>
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--text-muted)' }} onClick={e => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {showTcForm && (
        <div className="px-3 pb-3 flex gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <input className="input flex-1 mt-3" placeholder="Título do caso de teste *" value={tcTitle} onChange={e => onTcTitle(e.target.value)} autoFocus />
          <button className="btn-primary mt-3 flex items-center gap-1" disabled={!tcTitle.trim() || creating} onClick={onCreateTc}>
            {creating && <Loader2 className="w-3 h-3 animate-spin" />} Criar
          </button>
        </div>
      )}

      {open && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {tcs.length === 0 ? (
            <p className="text-sm px-10 py-4" style={{ color: 'var(--text-muted)' }}>Nenhum caso de teste nesta suite</p>
          ) : (
            tcs.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-3 px-10 py-2.5 transition-colors group border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <TestTube2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{tc.title}</span>
                {tc.last_exec_status ? (
                  <button
                    className={`${statusBadgeClass(tc.last_exec_status)} text-xs flex-shrink-0 hover:opacity-80 transition-opacity`}
                    title={`Última execução: ${tc.last_exec_status}${tc.last_exec_at ? ' — ' + formatDate(tc.last_exec_at) : ''}`}
                    onClick={() => tc.last_exec_id && navigate(`/executions/${tc.last_exec_id}`)}
                  >
                    {statusLabel(tc.last_exec_status)}
                  </button>
                ) : (
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>sem execução</span>
                )}
                {tc.exec_count > 0 && (
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{tc.exec_count}x</span>
                )}
                <span className="text-xs capitalize flex-shrink-0 hidden lg:block" style={{ color: 'var(--text-muted)' }}>{tc.priority}</span>
                <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-500/10 hover:text-blue-400 transition-all" style={{ color: 'var(--text-muted)' }} title="Editar no-code" onClick={() => onEditTc(tc.id)}>
                  <Pencil className="w-3 h-3" />
                </button>
                <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-green-500/10 hover:text-green-400 transition-all" style={{ color: 'var(--text-muted)' }} title="Executar" onClick={() => onRunTc(tc.id, tc.title)}>
                  <Play className="w-3 h-3" />
                </button>
                <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--text-muted)' }} onClick={() => onDeleteTc(tc.id)}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
