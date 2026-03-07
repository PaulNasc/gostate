import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, usersApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Shield, Loader2, Search, X, Filter } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-400 bg-green-500/10 border-green-500/20',
  update: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  delete: 'text-red-400 bg-red-500/10 border-red-500/20',
  cancel: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  login: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

const ENTITY_LABELS: Record<string, string> = {
  execution: 'Execução',
  project: 'Projeto',
  testcase: 'Caso de Teste',
  suite: 'Suite',
  user: 'Usuário',
  schedule: 'Agendamento',
  agent: 'Agente',
  integration: 'Integração',
};

export default function AuditPage() {
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityFilter, actionFilter, userFilter, page],
    queryFn: () => auditApi.list({
      entity: entityFilter || undefined,
      action: actionFilter || undefined,
      user_id: userFilter || undefined,
      limit,
      offset: page * limit,
    }),
    refetchInterval: 30000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-simple'],
    queryFn: () => usersApi.list(),
  });
  const users: any[] = usersData?.data?.users || [];

  const logs: any[] = data?.data?.logs || [];
  const total: number = data?.data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const clearFilters = () => { setEntityFilter(''); setActionFilter(''); setUserFilter(''); setPage(0); };
  const hasFilters = !!(entityFilter || actionFilter || userFilter);

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-violet-400" />
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Auditoria</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Log de ações por usuário — {total} registros
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />

        <select
          className="input text-sm py-1.5 w-36"
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(0); }}
        >
          <option value="">Entidade</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          className="input text-sm py-1.5 w-36"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(0); }}
        >
          <option value="">Ação</option>
          {['create', 'update', 'delete', 'cancel', 'login'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          className="input text-sm py-1.5 w-48"
          value={userFilter}
          onChange={e => { setUserFilter(e.target.value); setPage(0); }}
        >
          <option value="">Usuário</option>
          {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        {hasFilters && (
          <button className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors" onClick={clearFilters}>
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}

        <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {total} resultado{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Nenhum registro de auditoria</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Ações como criar execuções, projetos e usuários serão registradas aqui
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Quando</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ação</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Entidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Detalhe</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr
                  key={log.id}
                  className="border-b transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{log.user_name || '—'}</span>
                      {log.user_email && (
                        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{log.user_email}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ACTION_COLORS[log.action] || 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div>
                      <span className="text-xs" style={{ color: 'var(--text)' }}>
                        {ENTITY_LABELS[log.entity] || log.entity}
                      </span>
                      {log.entity_id && (
                        <code className="block text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          #{log.entity_id.slice(0, 8)}
                        </code>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <span className="text-xs truncate block" style={{ color: 'var(--text-muted)' }} title={log.detail || ''}>
                      {log.detail || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{log.ip || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Pág. {page + 1} de {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </button>
                <button
                  className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
