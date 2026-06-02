import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const ADMIN_API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getToken() {
  return localStorage.getItem('admin_token') || '';
}

async function apiFetch(path: string) {
  const res = await fetch(`${ADMIN_API}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');
}

export default function ArtifactsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-artifacts'],
    queryFn: () => apiFetch('/api/admin/artifacts'),
    refetchInterval: 30000,
  });

  const all: any[] = data?.artifacts || [];

  const filtered = all.filter(a => {
    const matchSearch = !search ||
      a.filename?.toLowerCase().includes(search.toLowerCase()) ||
      a.execution_id?.includes(search);
    const matchType = !typeFilter || a.type === typeFilter;
    return matchSearch && matchType;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const types = Array.from(new Set(all.map((a: any) => a.type).filter(Boolean)));

  const totalSize = all.reduce((acc: number, a: any) => acc + (a.size_bytes || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Artefatos</h1>
        <p className="text-sm mt-0.5 text-slate-400">
          {all.length} artefatos · {formatBytes(totalSize)} total
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="px-3 py-1.5 rounded-lg border text-sm bg-transparent text-white w-72"
          style={{ borderColor: '#1e2a3a' }}
          placeholder="Buscar por nome ou ID de execução..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="px-3 py-1.5 rounded-lg border text-sm bg-transparent text-white"
          style={{ borderColor: '#1e2a3a', background: '#0d1117' }}
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
        >
          <option value="">Todos os tipos</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(search || typeFilter) && (
          <button
            className="text-xs text-slate-400 hover:text-white transition-colors"
            onClick={() => { setSearch(''); setTypeFilter(''); setPage(1); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#1e2a3a' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#0d1117', borderBottom: '1px solid #1e2a3a' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Arquivo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tamanho</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Execução</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Criado em</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1e2a3a' }}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse" style={{ background: '#1e2a3a', width: j === 0 ? '60%' : '40%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  Nenhum artefato encontrado
                </td>
              </tr>
            ) : (
              paged.map((a: any) => {
                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(a.filename || '');
                const isVideo = /\.(mp4|webm|mov)$/i.test(a.filename || '');
                return (
                  <tr
                    key={a.id}
                    style={{ borderBottom: '1px solid #1e2a3a' }}
                    className="hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg flex-shrink-0">
                          {isImage ? '🖼️' : isVideo ? '🎬' : '📄'}
                        </span>
                        <span className="text-white font-mono text-xs truncate max-w-xs" title={a.filename}>
                          {a.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: a.type === 'screenshot' ? 'rgba(59,130,246,0.15)' : a.type === 'video' ? 'rgba(168,85,247,0.15)' : 'rgba(100,116,139,0.15)',
                          color: a.type === 'screenshot' ? '#60a5fa' : a.type === 'video' ? '#c084fc' : '#94a3b8',
                        }}
                      >
                        {a.type || 'file'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                      {formatBytes(a.size_bytes || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`http://localhost:3000/executions/${a.execution_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                        title={a.execution_id}
                      >
                        #{(a.execution_id || '').slice(0, 8)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={`${ADMIN_API}${a.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                        style={{ borderColor: '#1e2a3a', color: '#94a3b8' }}
                      >
                        Ver
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {filtered.length} artefatos · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-30"
              style={{ borderColor: '#1e2a3a', color: '#94a3b8' }}
            >
              Anterior
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-30"
              style={{ borderColor: '#1e2a3a', color: '#94a3b8' }}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
