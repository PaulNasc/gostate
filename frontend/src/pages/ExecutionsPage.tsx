import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionsApi, projectsApi, API_BASE } from '../lib/api';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import {
  PlayCircle, RefreshCw, X, Loader2, ExternalLink,
  CheckCircle2, XCircle, Clock, AlertCircle, ChevronsLeft, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { io as socketIo } from 'socket.io-client';

const STATUS_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'running', label: 'Executando' },
  { key: 'passed', label: 'Passou' },
  { key: 'failed', label: 'Falhou' },
  { key: 'queued', label: 'Na fila' },
  { key: 'error', label: 'Erro' },
  { key: 'cancelled', label: 'Cancelado' },
] as const;

const PAGE_SIZE_OPTIONS = [9, 20, 50] as const;
const VISIBLE_PAGES = 4;

function StatusDot({ status }: { status: string }) {
  if (status === 'running') return <span className="flex items-center gap-1 text-blue-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="text-xs font-medium">Executando</span></span>;
  if (status === 'passed') return <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /><span className="text-xs font-medium">Passou</span></span>;
  if (status === 'failed') return <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3.5 h-3.5" /><span className="text-xs font-medium">Falhou</span></span>;
  if (status === 'queued') return <span className="flex items-center gap-1 text-amber-400"><Clock className="w-3.5 h-3.5" /><span className="text-xs font-medium">Na fila</span></span>;
  if (status === 'error') return <span className="flex items-center gap-1 text-orange-400"><AlertCircle className="w-3.5 h-3.5" /><span className="text-xs font-medium">Erro</span></span>;
  return <span className={`${statusBadgeClass(status)} text-xs`}>{statusLabel(status)}</span>;
}

export default function ExecutionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(9);

  // Fetch a large batch — enough to support all pagination client-side
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['executions', 500],
    queryFn: () => executionsApi.list({ limit: 500 }),
    refetchInterval: 5000,
  });
  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const projects: any[] = projectsData?.data?.projects || [];
  const allExecutions: any[] = data?.data?.executions || [];

  // Backend already returns: running/queued first, then created_at DESC — preserve that order
  const sorted = allExecutions;

  // Apply filters
  const filtered = sorted
    .filter(e => filterStatus === 'all' || e.status === filterStatus)
    .filter(e => !filterProject || e.project_id === filterProject);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset to page 1 when filters or pageSize change
  useEffect(() => { setPage(1); }, [filterStatus, filterProject, pageSize]);
  // Clamp page if total pages shrinks
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const pageExecutions = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Pagination window: always show VISIBLE_PAGES buttons, sliding with current page
  const getPageNumbers = () => {
    if (totalPages <= VISIBLE_PAGES) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, page - Math.floor(VISIBLE_PAGES / 2));
    let end = start + VISIBLE_PAGES - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - VISIBLE_PAGES + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const cancel = useMutation({
    mutationFn: (id: string) => executionsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executions'] }),
  });

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token) return;
    const socket = socketIo(API_BASE, { auth: { token } });
    socket.on('exec:started', () => qc.invalidateQueries({ queryKey: ['executions'] }));
    socket.on('exec:finished', () => qc.invalidateQueries({ queryKey: ['executions'] }));
    socket.on('exec:update', () => qc.invalidateQueries({ queryKey: ['executions'] }));
    socket.on('exec:cancelled', () => qc.invalidateQueries({ queryKey: ['executions'] }));
    return () => { socket.disconnect(); };
  }, [qc]);

  const running = allExecutions.filter(e => e.status === 'running' || e.status === 'queued').length;
  const passed = allExecutions.filter(e => e.status === 'passed').length;
  const failed = allExecutions.filter(e => e.status === 'failed').length;
  const total = allExecutions.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const pageNums = getPageNumbers();

  return (
    <div className="p-6 flex flex-col gap-5" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Execuções</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'execução' : 'execuções'}{filtered.length !== total ? ` de ${total}` : ' no total'}
          </p>
        </div>
        <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Summary cards */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
          <div className="card px-4 py-3">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pass Rate</p>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${passRate >= 80 ? 'text-green-400' : passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{passRate}%</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className={`h-full rounded-full ${passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${passRate}%` }} />
              </div>
            </div>
          </div>
          <div className="card px-4 py-3">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Passaram</p>
            <p className="text-lg font-bold text-green-400">{passed}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Falharam</p>
            <p className="text-lg font-bold text-red-400">{failed}</p>
          </div>
          <div className="card px-4 py-3">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Em andamento</p>
            <p className={`text-lg font-bold ${running > 0 ? 'text-blue-400' : 'text-slate-500'}`}>{running}</p>
          </div>
        </div>
      )}

      {/* Project filter */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            className="input text-sm py-1.5 px-3 w-56"
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
          >
            <option value="">Todos os projetos</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {filterProject && (
            <button className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }} onClick={() => setFilterProject('')}>Limpar</button>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {STATUS_FILTERS.map(f => {
          const count = f.key === 'all'
            ? sorted.filter(e => !filterProject || e.project_id === filterProject).length
            : sorted.filter(e => e.status === f.key && (!filterProject || e.project_id === filterProject)).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className="px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5"
              style={filterStatus === f.key
                ? { color: 'var(--primary)', borderColor: 'var(--primary)' }
                : { color: 'var(--text-muted)', borderColor: 'transparent' }
              }
            >
              {f.label}
              {count > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={filterStatus === f.key
                    ? { background: 'rgba(59,130,246,0.15)', color: 'var(--primary)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-muted)' }
                  }>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table area */}
      {isLoading ? (
        <div className="flex justify-center py-12 flex-shrink-0"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center flex-shrink-0">
          <PlayCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">
            {filterStatus === 'all' ? 'Nenhuma execução ainda' : `Nenhuma execução com status "${statusLabel(filterStatus)}"`}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {filterStatus === 'all' ? 'Execute um caso de teste para ver os resultados aqui' : 'Tente outro filtro'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden flex-shrink-0">
          {/* Fixed-height table — no vertical scroll */}
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-32" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-48" style={{ color: 'var(--text-muted)' }}>Caso / Script</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-28" style={{ color: 'var(--text-muted)' }}>Projeto</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-28" style={{ color: 'var(--text-muted)' }}>Browser</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-32" style={{ color: 'var(--text-muted)' }}>Agente</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-24" style={{ color: 'var(--text-muted)' }}>Duração</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-40" style={{ color: 'var(--text-muted)' }}>Iniciado</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {pageExecutions.map((exec) => (
                <tr
                  key={exec.id}
                  className="border-b transition-colors cursor-pointer group"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => navigate(`/executions/${exec.id}`)}
                >
                  <td className="px-4 py-3"><StatusDot status={exec.status} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium truncate" style={{ color: 'var(--text)' }}>{exec.tc_title || exec.script_filename || `#${exec.id.slice(0, 8)}`}</p>
                    {exec.suite_name && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{exec.suite_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{exec.project_name || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {exec.browsers ? (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {(() => { try { return JSON.parse(exec.browsers)[0]; } catch { return exec.browsers; } })()}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{exec.agent_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text)' }}>{formatDuration(exec.duration_ms)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(exec.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {['queued', 'running'].includes(exec.status) && (
                        <button
                          className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }}
                          onClick={e => { e.stopPropagation(); cancel.mutate(exec.id); }}
                          title="Cancelar"
                        ><X className="w-3.5 h-3.5" /></button>
                      )}
                      <button
                        className="p-1.5 rounded hover:bg-black/10 transition-colors" style={{ color: 'var(--text-muted)' }}
                        onClick={e => { e.stopPropagation(); navigate(`/executions/${exec.id}`); }}
                        title="Ver detalhes"
                      ><ExternalLink className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t gap-3" style={{ borderColor: 'var(--border)' }}>

            {/* Left: info + page size selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {filtered.length === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}`} de {filtered.length}
              </span>
              <select
                className="text-xs rounded-md px-2 py-1 border outline-none"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
            </div>

            {/* Right: pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                {/* Back to first */}
                <button
                  className="p-1.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                {/* Previous */}
                <button
                  className="p-1.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Page number buttons */}
                {pageNums[0] > 1 && (
                  <>
                    <button
                      className="w-7 h-7 text-xs rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => setPage(1)}
                    >1</button>
                    {pageNums[0] > 2 && <span className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>…</span>}
                  </>
                )}

                {pageNums.map(n => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className="w-7 h-7 text-xs rounded font-medium transition-all"
                    style={n === page
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { color: 'var(--text-muted)', background: 'transparent' }
                    }
                  >{n}</button>
                ))}

                {pageNums[pageNums.length - 1] < totalPages && (
                  <>
                    {pageNums[pageNums.length - 1] < totalPages - 1 && <span className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>…</span>}
                    <button
                      className="w-7 h-7 text-xs rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => setPage(totalPages)}
                    >{totalPages}</button>
                  </>
                )}

                {/* Next */}
                <button
                  className="p-1.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
