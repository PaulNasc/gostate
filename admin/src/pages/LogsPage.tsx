import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Loader2, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { usersApi } from '../api';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(normalized));
  } catch { return d; }
}

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-400 bg-green-500/10 border-green-500/20',
  update: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  delete: 'text-red-400 bg-red-500/10 border-red-500/20',
  cancel: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  login:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

const ENTITY_LABELS: Record<string, string> = {
  execution:   'Execução',
  project:     'Projeto',
  testcase:    'Caso de Teste',
  suite:       'Suite',
  user:        'Usuário',
  schedule:    'Agendamento',
  agent:       'Agente',
  integration: 'Integração',
};

function normalizeIp(raw: string | null | undefined): string {
  if (!raw) return '—';
  if (raw === '::1' || raw === '::ffff:127.0.0.1') return '127.0.0.1';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

const PAGE_SIZE = 10;

export default function LogsPage() {
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter]     = useState('');
  const [page, setPage]                 = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', entityFilter, actionFilter, userFilter, page],
    queryFn: () => api.get('/api/audit', {
      params: {
        entity:  entityFilter  || undefined,
        action:  actionFilter  || undefined,
        user_id: userFilter    || undefined,
        limit:   PAGE_SIZE,
        offset:  page * PAGE_SIZE,
      },
    }),
    refetchInterval: 30000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-audit'],
    queryFn: () => usersApi.list(),
  });
  const users: any[] = usersData?.data?.users || [];

  const logs: any[]    = data?.data?.logs  || [];
  const total: number  = data?.data?.total || 0;
  const totalPages     = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => { setEntityFilter(''); setActionFilter(''); setUserFilter(''); setPage(0); };
  const hasFilters   = !!(entityFilter || actionFilter || userFilter);

  return (
    <div className="p-6 space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Logs</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Log de ações por usuário — {total} registro{total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl border" style={{ background: '#0d1117', borderColor: '#1e2a3a' }}>
        <Filter className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />

        <select
          className="text-xs rounded-lg px-2.5 py-1.5 border outline-none"
          style={{ background: '#0a0d14', borderColor: '#1e2a3a', color: '#94a3b8' }}
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(0); }}
        >
          <option value="">Entidade</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          className="text-xs rounded-lg px-2.5 py-1.5 border outline-none"
          style={{ background: '#0a0d14', borderColor: '#1e2a3a', color: '#94a3b8' }}
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(0); }}
        >
          <option value="">Ação</option>
          {['create', 'update', 'delete', 'cancel', 'login'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          className="text-xs rounded-lg px-2.5 py-1.5 border outline-none"
          style={{ background: '#0a0d14', borderColor: '#1e2a3a', color: '#94a3b8' }}
          value={userFilter}
          onChange={e => { setUserFilter(e.target.value); setPage(0); }}
        >
          <option value="">Usuário</option>
          {users.map((u: any) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>

        {hasFilters && (
          <button
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
            onClick={clearFilters}
          >
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500">{total} resultado{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border p-16 text-center" style={{ background: '#0d1117', borderColor: '#1e2a3a' }}>
          <ScrollText className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-medium text-slate-500">Nenhum registro de log</p>
          <p className="text-sm mt-1 text-slate-600">Ações como criar execuções, projetos e usuários serão registradas aqui</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: '#0d1117', borderColor: '#1e2a3a' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: '#1e2a3a' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Quando</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Entidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-1/3">Detalhe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className="border-b transition-colors"
                    style={{ borderColor: '#1e2a3a', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                  >
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap text-slate-400">
                      {formatDate(log.created_at)}
                    </td>

                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-white">{log.user_name || '—'}</p>
                      {log.user_email && (
                        <p className="text-xs text-slate-500 mt-0.5">{log.user_email}</p>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ACTION_COLORS[log.action] || 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                        {log.action}
                      </span>
                    </td>

                    <td className="px-4 py-2.5">
                      <p className="text-xs text-white">{ENTITY_LABELS[log.entity] || log.entity}</p>
                      {log.entity_id && (
                        <code className="block text-xs font-mono text-slate-500 mt-0.5">
                          #{log.entity_id.slice(0, 8)}
                        </code>
                      )}
                    </td>

                    <td className="px-4 py-2.5 max-w-xs">
                      {log.detail ? (
                        <span
                          className="text-xs text-slate-300 block truncate"
                          title={log.detail}
                        >
                          {log.detail}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-400">
                        {normalizeIp(log.ip)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: '#1e2a3a' }}>
            <span className="text-xs text-slate-500">
              Pág. {page + 1} de {totalPages} · {total} total
            </span>
            <div className="flex items-center gap-1">
              <button
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i;
                } else if (page < 4) {
                  p = i < 5 ? i : (i === 5 ? -1 : totalPages - 1);
                } else if (page > totalPages - 5) {
                  p = i === 0 ? 0 : (i === 1 ? -1 : totalPages - 7 + i);
                } else {
                  p = i === 0 ? 0 : i === 1 ? -1 : i === 2 ? page - 1 : i === 3 ? page : i === 4 ? page + 1 : i === 5 ? -1 : totalPages - 1;
                }
                if (p === -1) return <span key={i} className="text-xs text-slate-600 px-1">…</span>;
                return (
                  <button
                    key={i}
                    className="text-xs w-7 h-7 rounded-lg transition-colors font-medium"
                    style={p === page
                      ? { background: 'rgba(124,58,237,0.25)', color: '#a78bfa' }
                      : { color: '#94a3b8' }
                    }
                    onMouseEnter={e => { if (p !== page) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (p !== page) e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => setPage(p)}
                  >
                    {p + 1}
                  </button>
                );
              })}

              <button
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Próxima <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
