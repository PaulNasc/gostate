import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../lib/api';
import { formatDate, statusBadgeClass, statusLabel } from '../lib/utils';
import { Plus, FolderOpen, Trash2, ChevronRight, Loader2, Pencil, X, TestTube2, Layers } from 'lucide-react';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; project?: any } | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const projects: any[] = data?.data?.projects || [];

  const openCreate = () => { setName(''); setDesc(''); setModal({ mode: 'create' }); };
  const openEdit = (p: any) => { setName(p.name); setDesc(p.description || ''); setModal({ mode: 'edit', project: p }); };

  const create = useMutation({
    mutationFn: () => projectsApi.create({ name, description: desc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setModal(null); },
  });

  const update = useMutation({
    mutationFn: () => projectsApi.update(modal!.project!.id, { name, description: desc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setModal(null); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const handleSubmit = () => modal?.mode === 'create' ? create.mutate() : update.mutate();
  const isPending = create.isPending || update.isPending;
  const isError = create.isError || update.isError;
  const errMsg = (create.error || update.error as any)?.response?.data?.error;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Projetos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{projects.length} projeto{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum projeto ainda</p>
          <p className="text-sm text-slate-600 mt-1">Crie seu primeiro projeto para começar</p>
          <button className="btn-primary mt-4 flex items-center gap-2 mx-auto" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Criar Projeto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="card p-4 hover:border-blue-500/40 transition-all group cursor-pointer flex flex-col"
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                    {p.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{p.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                  <button
                    className="p-1.5 rounded-lg hover:bg-blue-500/10 hover:text-blue-400 transition-colors" style={{ color: 'var(--text-muted)' }}
                    title="Editar projeto"
                    onClick={e => { e.stopPropagation(); openEdit(p); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }}
                    title="Excluir projeto"
                    onClick={e => { e.stopPropagation(); if (confirm(`Excluir "${p.name}"? Esta ação é irreversível.`)) remove.mutate(p.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Pass rate bar */}
              {(p.exec_total ?? 0) > 0 && (() => {
                const rate = Math.round((p.exec_passed / p.exec_total) * 100);
                return (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pass rate</span>
                      <span className={`text-xs font-bold ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{rate}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <Layers className="w-3.5 h-3.5" />
                  <span>{p.suites_count || 0} suites</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <TestTube2 className="w-3.5 h-3.5" />
                  <span>{p.tc_count || 0} casos</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {(p.running_count ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
                      </span>
                      {p.running_count} rodando
                    </span>
                  )}
                  {p.last_exec_status ? (
                    <span className={`${statusBadgeClass(p.last_exec_status)} text-xs`}>{statusLabel(p.last_exec_status)}</span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(p.created_at)}</span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 group-hover:text-blue-400 transition-colors" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="card p-6 w-full max-w-md mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>{modal.mode === 'create' ? 'Novo Projeto' : 'Editar Projeto'}</h3>
              <button onClick={() => setModal(null)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Nome *</label>
                <input
                  className="input w-full"
                  placeholder="Nome do projeto"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && name.trim() && handleSubmit()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Descrição</label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="Descrição opcional"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                />
              </div>
            </div>
            {isError && <p className="text-xs text-red-400">{errMsg || 'Erro ao salvar'}</p>}
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button
                className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
                disabled={!name.trim() || isPending}
                onClick={handleSubmit}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {modal.mode === 'create' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
