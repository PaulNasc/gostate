import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Copy, CheckCircle2, Loader2, AlertTriangle, Eye, EyeOff, X, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiTokensApi } from '../lib/api';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  const normalized = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(normalized));
  } catch { return d; }
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function NewTokenModal({ onClose, onCreate }: { onClose: () => void; onCreate: (raw: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => apiTokensApi.create({ name: name.trim(), expires_at: expires || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['api-tokens'] });
      onCreate(res.data.raw_token);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || 'Erro ao criar token');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Novo API Token</h3>
          <button className="p-1.5 rounded-lg hover:bg-black/10 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Nome do token <span className="text-red-400">*</span></label>
            <input
              className="input w-full"
              placeholder="Ex: CI/CD GitHub Actions, Deploy Pipeline..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && name.trim() && create.mutate()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Expiração <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opcional — deixe em branco para não expirar)</span></label>
            <input
              className="input w-full"
              type="datetime-local"
              value={expires}
              onChange={e => setExpires(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary flex items-center gap-2 flex-1"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Token
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function RevealTokenModal({ rawToken, onClose }: { rawToken: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(true);

  const copy = () => {
    navigator.clipboard.writeText(rawToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Token criado com sucesso</h3>
          <button className="p-1.5 rounded-lg hover:bg-black/10 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <span className="text-yellow-200/80">Copie este token agora. Ele não será exibido novamente por segurança.</span>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>API Token</span>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded hover:bg-black/10 transition-colors" style={{ color: 'var(--text-muted)' }} onClick={() => setVisible(v => !v)} title={visible ? 'Ocultar' : 'Mostrar'}>
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-black/10 transition-colors" style={{ color: copied ? '#4ade80' : 'var(--text-muted)' }} onClick={copy}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <div className="p-4 font-mono text-sm break-all select-all" style={{ color: 'var(--primary)' }}>
            {visible ? rawToken : rawToken.slice(0, 12) + '•'.repeat(rawToken.length - 12)}
          </div>
        </div>

        <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Como usar</p>
          <p style={{ color: 'var(--text-muted)' }}>Inclua no header <code className="text-primary">Authorization: Bearer SEU_TOKEN</code> em todas as requisições à API.</p>
          <div className="rounded-lg p-3 font-mono text-xs mt-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
            <p className="text-slate-400"># Exemplo com curl</p>
            <p className="text-slate-300 mt-1">curl -H "Authorization: Bearer {rawToken.slice(0, 16)}..." \</p>
            <p className="text-slate-300">{'  '}https://seu-backend.com/api/executions</p>
            <p className="text-slate-400 mt-2"># Exemplo no GitHub Actions</p>
            <p className="text-slate-300">env:</p>
            <p className="text-slate-300">{'  '}GOSTATE_TOKEN: {'${{ secrets.GOSTATE_TOKEN }}'}</p>
          </div>
        </div>

        <button className="btn-primary w-full" onClick={onClose}>
          <CheckCircle2 className="w-4 h-4" /> Já copiei, fechar
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showNewModal, setShowNewModal] = useState(false);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => apiTokensApi.list(),
  });
  const tokens: any[] = data?.data?.tokens || [];

  const remove = useMutation({
    mutationFn: (id: string) => apiTokensApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-tokens'] }); setDeletingId(null); },
  });

  const handleCreate = (raw: string) => {
    setShowNewModal(false);
    setRawToken(raw);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {showNewModal && <NewTokenModal onClose={() => setShowNewModal(false)} onCreate={handleCreate} />}
      {rawToken && <RevealTokenModal rawToken={rawToken} onClose={() => setRawToken(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <KeyRound className="w-5 h-5 text-primary" /> API Tokens
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Tokens pessoais para integrar sistemas externos (CI/CD, scripts) com a API do goState.
        </p>
      </div>

      {/* User info */}
      <div className="card p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
          {user?.name?.slice(0, 1)?.toUpperCase() || user?.email?.slice(0, 1)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{user?.name || '—'}</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
          {user?.role}
        </span>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
        <div className="space-y-1" style={{ color: 'var(--text-muted)' }}>
          <p>Tokens com prefixo <code className="text-primary">gst_</code> podem ser usados no header <code className="text-primary">Authorization: Bearer</code> em qualquer endpoint autenticado da API.</p>
          <p>Cada usuário pode ter até <strong style={{ color: 'var(--text)' }}>20 tokens</strong> ativos. Tokens expirados são rejeitados automaticamente.</p>
        </div>
      </div>

      {/* Tokens list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Tokens ativos <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>({tokens.length}/20)</span>
          </h2>
          <button
            className="btn-primary flex items-center gap-2 text-sm"
            onClick={() => setShowNewModal(true)}
            disabled={tokens.length >= 20}
          >
            <Plus className="w-4 h-4" /> Novo Token
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
        ) : tokens.length === 0 ? (
          <div className="card p-10 text-center">
            <KeyRound className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Nenhum token criado</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Crie um token para integrar CI/CD, GitHub Actions ou scripts externos</p>
            <button className="btn-primary mt-4 mx-auto flex items-center gap-2" onClick={() => setShowNewModal(true)}>
              <Plus className="w-4 h-4" /> Criar primeiro token
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((token: any) => {
              const expired = isExpired(token.expires_at);
              return (
                <div
                  key={token.id}
                  className="card p-4 flex items-center gap-3"
                  style={{ opacity: expired ? 0.6 : 1, borderColor: expired ? 'var(--border)' : undefined }}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${expired ? 'bg-red-500/10' : 'bg-primary/10'}`}>
                    <KeyRound className={`w-4 h-4 ${expired ? 'text-red-400' : 'text-primary'}`} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{token.name}</span>
                      {expired && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">Expirado</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                      <code className="font-mono" style={{ color: 'var(--primary)' }}>{token.token_prefix}••••••••</code>
                      <span>Criado: {formatDate(token.created_at)}</span>
                      {token.last_used_at && <span>Último uso: {formatDate(token.last_used_at)}</span>}
                      {token.expires_at && (
                        <span className={expired ? 'text-red-400' : ''}>
                          Expira: {formatDate(token.expires_at)}
                        </span>
                      )}
                      {!token.expires_at && <span>Sem expiração</span>}
                    </div>
                  </div>

                  {deletingId === token.id ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Confirmar?</span>
                      <button
                        className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors border border-red-500/20"
                        onClick={() => remove.mutate(token.id)}
                        disabled={remove.isPending}
                      >
                        {remove.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim, revogar'}
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded hover:bg-black/10 transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => setDeletingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors flex-shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                      title="Revogar token"
                      onClick={() => setDeletingId(token.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
