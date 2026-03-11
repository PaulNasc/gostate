import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionsApi, projectsApi, agentsApi, API_BASE } from '../lib/api';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import {
  PlayCircle, RefreshCw, X, Loader2, ExternalLink,
  CheckCircle2, XCircle, Clock, AlertCircle, ChevronsLeft, ChevronLeft, ChevronRight,
  RotateCcw, Columns2, Download, CalendarDays,
} from 'lucide-react';
import { io as socketIo } from 'socket.io-client';
import { useToast } from '../components/Toast';

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
  const toast = useToast();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(9);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleCompare = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareSet(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); }
      else if (n.size < 2) { n.add(id); }
      return n;
    });
  };

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
    .filter(e => !filterProject || e.project_id === filterProject)
    .filter(e => {
      if (!dateFrom && !dateTo) return true;
      const d = new Date(e.created_at?.includes('T') ? e.created_at : e.created_at?.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return true;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Reset to page 1 when filters or pageSize change
  useEffect(() => { setPage(1); }, [filterStatus, filterProject, pageSize, dateFrom, dateTo]);
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

  const rerunFailed = useMutation({
    mutationFn: async () => {
      const { data: agentsData } = await agentsApi.list();
      const agent = (agentsData?.agents || []).find((a: any) => a.status === 'online');
      if (!agent) throw new Error('Nenhum agente online disponível');
      const failedInView = filtered.filter(e => (e.status === 'failed' || e.status === 'error') && e.test_case_id);
      const uniqueTcIds = [...new Set(failedInView.map((e: any) => e.test_case_id))];
      if (uniqueTcIds.length === 0) throw new Error('Nenhum caso de teste com falha nesta visão');
      await Promise.all(uniqueTcIds.map((tcId: any) =>
        executionsApi.create({ test_case_id: tcId, browsers: ['chromium'], video_enabled: false, screenshot_enabled: true })
      ));
      return uniqueTcIds.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['executions'] });
      toast.success(`${count} caso${count !== 1 ? 's' : ''} re-executado${count !== 1 ? 's' : ''}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao re-executar'),
  });

  const failedCount = filtered.filter(e => e.status === 'failed' || e.status === 'error').length;

  const exportCSV = () => {
    const headers = ['ID', 'Status', 'Caso / Script', 'Projeto', 'Browser', 'Agente', 'Duração (ms)', 'Iniciado'];
    const rows = filtered.map(e => [
      e.id,
      e.status,
      e.tc_title || e.script_filename || '',
      e.project_name || '',
      (() => { try { return JSON.parse(e.browsers)?.[0] || ''; } catch { return e.browsers || ''; } })(),
      e.agent_name || '',
      e.duration_ms ?? '',
      e.created_at || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execucoes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div className="flex items-center gap-2">
          {compareSet.size === 2 && (
            <button
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              onClick={() => setShowCompare(true)}
            >
              <Columns2 className="w-3.5 h-3.5" /> Comparar selecionadas
            </button>
          )}
          {compareSet.size > 0 && (
            <button
              className="text-xs px-2 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => setCompareSet(new Set())}
            >
              <X className="w-3 h-3 inline mr-1" />Limpar seleção ({compareSet.size}/2)
            </button>
          )}
          {failedCount > 0 && (
            <button
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              disabled={rerunFailed.isPending}
              onClick={() => rerunFailed.mutate()}
              title={`Re-executar ${failedCount} caso${failedCount !== 1 ? 's' : ''} com falha`}
            >
              {rerunFailed.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              Re-executar falhos ({failedCount})
            </button>
          )}
          <button
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            onClick={exportCSV}
            title="Exportar lista filtrada como CSV"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
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

      {/* Filters row: project + date range */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        {projects.length > 0 && (
          <select
            className="input text-sm py-1.5 px-3 w-52"
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
          >
            <option value="">Todos os projetos</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            type="date"
            className="input text-xs py-1.5 px-2 w-36"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="Data de início"
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>até</span>
          <input
            type="date"
            className="input text-xs py-1.5 px-2 w-36"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="Data de fim"
          />
        </div>
        {(filterProject || dateFrom || dateTo) && (
          <button
            className="text-xs transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => { setFilterProject(''); setDateFrom(''); setDateTo(''); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

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
                  className={`border-b transition-colors cursor-pointer group ${compareSet.has(exec.id) ? 'ring-1 ring-inset ring-blue-500/40' : ''}`}
                  style={{ borderColor: 'var(--border)', background: compareSet.has(exec.id) ? 'rgba(59,130,246,0.05)' : '' }}
                  onMouseEnter={e => { if (!compareSet.has(exec.id)) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!compareSet.has(exec.id)) e.currentTarget.style.background = 'transparent'; }}
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
                    <div className="flex items-center gap-1">
                      <button
                        className={`p-1.5 rounded transition-all ${
                          compareSet.has(exec.id)
                            ? 'text-blue-400 bg-blue-500/15'
                            : 'opacity-0 group-hover:opacity-100 hover:bg-blue-500/10 hover:text-blue-400'
                        } ${compareSet.size >= 2 && !compareSet.has(exec.id) ? 'opacity-20 pointer-events-none' : ''}`}
                        style={{ color: compareSet.has(exec.id) ? undefined : 'var(--text-muted)' }}
                        onClick={e => toggleCompare(exec.id, e)}
                        title={compareSet.has(exec.id) ? 'Remover da comparação' : 'Selecionar para comparar'}
                      >
                        <Columns2 className="w-3.5 h-3.5" />
                      </button>
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

      {/* Compare modal */}
      {showCompare && compareSet.size === 2 && (
        <CompareModal
          ids={Array.from(compareSet)}
          allExecs={allExecutions}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}

function ComparePanel({ exec }: { exec: any }) {
  const { data } = useQuery({
    queryKey: ['execution-detail', exec.id],
    queryFn: () => executionsApi.get(exec.id),
  });
  const detail = data?.data;
  const steps: any[] = detail?.steps || [];

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* Header */}
      <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface-3)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusDot status={exec.status} />
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
            {exec.tc_title || exec.script_filename || `#${exec.id.slice(0, 8)}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>ID: <code className="font-mono">#{exec.id.slice(0, 8)}</code></span>
          <span>Duração: {formatDuration(exec.duration_ms)}</span>
          <span>Agente: {exec.agent_name || '—'}</span>
          <span>Iniciado: {formatDate(exec.created_at)}</span>
          {exec.browsers && <span>Browser: {(() => { try { return JSON.parse(exec.browsers)[0]; } catch { return exec.browsers; } })()}</span>}
          {exec.project_name && <span>Projeto: {exec.project_name}</span>}
        </div>
      </div>

      {/* Steps */}
      {steps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Steps ({steps.length})</p>
          {steps.map((s: any, i: number) => (
            <div
              key={s.id || i}
              className="flex items-start gap-2 px-2 py-1.5 rounded text-xs"
              style={{ background: 'var(--surface-2)' }}
            >
              <span className="flex-shrink-0 mt-0.5">
                {s.status === 'passed' ? <CheckCircle2 className="w-3 h-3 text-green-400" /> :
                 s.status === 'failed' ? <XCircle className="w-3 h-3 text-red-400" /> :
                 s.status === 'error' ? <AlertCircle className="w-3 h-3 text-orange-400" /> :
                 <Clock className="w-3 h-3 text-slate-500" />}
              </span>
              <div className="flex-1 min-w-0">
                <span className="truncate block" style={{ color: 'var(--text)' }}>
                  {s.action || s.description || `Step ${i + 1}`}
                </span>
                {s.error_message && (
                  <span className="text-red-400 block mt-0.5 truncate">{s.error_message}</span>
                )}
              </div>
              {s.duration_ms != null && (
                <span className="flex-shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>
                  {formatDuration(s.duration_ms)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
          {detail ? 'Sem steps registrados' : 'Carregando...'}
        </p>
      )}
    </div>
  );
}

function CompareModal({ ids, allExecs, onClose }: { ids: string[]; allExecs: any[]; onClose: () => void }) {
  const execA = allExecs.find(e => e.id === ids[0]);
  const execB = allExecs.find(e => e.id === ids[1]);
  if (!execA || !execB) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-6xl rounded-xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Columns2 className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Comparação de Execuções</span>
          </div>
          <button
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          {[execA, execB].map((exec, i) => (
            <div
              key={exec.id}
              className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 ${i === 0 ? 'border-r' : ''}`}
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
            >
              <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--surface-3)' }}>
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="truncate">{exec.tc_title || exec.script_filename || `#${exec.id.slice(0, 8)}`}</span>
            </div>
          ))}
        </div>

        {/* Split panels */}
        <div className="grid grid-cols-2 flex-1 overflow-hidden">
          <div className="border-r p-4 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
            <ComparePanel exec={execA} />
          </div>
          <div className="p-4 overflow-y-auto">
            <ComparePanel exec={execB} />
          </div>
        </div>
      </div>
    </div>
  );
}
