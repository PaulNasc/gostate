import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Copy, CheckCircle2, Loader2, AlertTriangle, Eye, EyeOff, X, Info, ChevronDown } from 'lucide-react';
import { apiTokensApi } from '../api';

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
    mutationFn: () => apiTokensApi.create({ name: name.trim(), expires_at: expires ? new Date(expires).toISOString() : undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-api-tokens'] });
      onCreate(res.data.raw_token);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || 'Erro ao criar token');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: '#0d1117', border: '1px solid #2a3352' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Novo API Token</h3>
          <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome do token <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none focus:ring-1 focus:ring-cyan-500"
              style={{ background: '#0a0d14', border: '1px solid #2a3352' }}
              placeholder="Ex: CI/CD GitHub Actions, Deploy Pipeline..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && name.trim() && create.mutate()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Expiração <span className="text-xs font-normal text-slate-600">(opcional — deixe em branco para não expirar)</span>
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none focus:ring-1 focus:ring-cyan-500"
              style={{ background: '#0a0d14', border: '1px solid #2a3352' }}
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(124,58,237,0.25)', color: '#22d3ee', border: '1px solid rgba(124,58,237,0.4)' }}
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Token
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            onClick={onClose}
          >
            Cancelar
          </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: '#0d1117', border: '1px solid #2a3352' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Token criado com sucesso</h3>
          <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <span className="text-yellow-200/80">Copie este token agora. Por segurança, ele não será exibido novamente.</span>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: '#020409', border: '1px solid #2a3352' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#2a3352' }}>
            <span className="text-xs font-mono text-slate-500">API Token</span>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400" onClick={() => setVisible(v => !v)} title={visible ? 'Ocultar' : 'Mostrar'}>
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10 transition-colors"
                style={{ color: copied ? '#4ade80' : '#94a3b8' }}
                onClick={copy}
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <div className="p-4 font-mono text-sm break-all select-all text-cyan-300">
            {visible ? rawToken : rawToken.slice(0, 12) + '•'.repeat(Math.max(0, rawToken.length - 12))}
          </div>
        </div>

        <div className="rounded-xl p-4 space-y-2 text-xs" style={{ background: '#0a0f1a', border: '1px solid #1e2a3a' }}>
          <p className="font-semibold text-slate-300">Como usar</p>
          <p className="text-slate-500">Inclua no header <code className="text-cyan-400">Authorization: Bearer SEU_TOKEN</code> em todas as requisições à API.</p>
          <div className="rounded-lg p-3 font-mono text-xs mt-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #2a3352' }}>
            <p className="text-slate-500"># Exemplo com curl</p>
            <p className="text-slate-300 mt-1">curl -H "Authorization: Bearer {rawToken.slice(0, 16)}..." \</p>
            <p className="text-slate-300">{'  '}https://seu-backend.com/api/executions</p>
            <p className="text-slate-500 mt-2"># GitHub Actions secrets</p>
            <p className="text-slate-300">env:</p>
            <p className="text-slate-300">{'  '}GOSTATE_TOKEN: {'${{ secrets.GOSTATE_TOKEN }}'}</p>
          </div>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
          onClick={onClose}
        >
          <CheckCircle2 className="w-4 h-4" /> Já copiei, fechar
        </button>
      </div>
    </div>
  );
}

export default function ApiTokensPage() {
  const qc = useQueryClient();
  const [showNewModal, setShowNewModal] = useState(false);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-api-tokens'],
    queryFn: () => apiTokensApi.listMine(),
    refetchInterval: 30000,
  });
  const tokens: any[] = data?.data?.tokens || [];

  const remove = useMutation({
    mutationFn: (id: string) => apiTokensApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-api-tokens'] }); setDeletingId(null); },
  });

  const handleCreate = (raw: string) => {
    setShowNewModal(false);
    setRawToken(raw);
  };

  return (
    <div className="h-full flex flex-col">
      {showNewModal && <NewTokenModal onClose={() => setShowNewModal(false)} onCreate={handleCreate} />}
      {rawToken && <RevealTokenModal rawToken={rawToken} onClose={() => setRawToken(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0" style={{ borderColor: '#1e2a3a' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.2)' }}>
            <KeyRound className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">API Tokens</h1>
            <p className="text-xs text-slate-500">Tokens pessoais para integrar CI/CD, scripts e sistemas externos com a API do goState</p>
          </div>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
          style={{ background: 'rgba(124,58,237,0.25)', color: '#22d3ee', border: '1px solid rgba(124,58,237,0.4)' }}
          onClick={() => setShowNewModal(true)}
          disabled={tokens.length >= 20}
        >
          <Plus className="w-4 h-4" /> Novo Token
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Info box */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2a3a' }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
            style={{ background: '#0a0f1a' }}
            onClick={() => setShowGuide(v => !v)}
          >
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span>Tokens com prefixo <code className="text-cyan-400">gst_</code> autenticam via header <code className="text-cyan-400">Authorization: Bearer</code>. Limite: <strong className="text-white">20 tokens</strong> por usuário.</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-600 flex-shrink-0 ml-3 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
          </button>
          {showGuide && (
            <div className="px-4 pb-4 pt-1 space-y-3 text-xs" style={{ background: '#0a0f1a', borderTop: '1px solid #1e2a3a' }}>
              <p className="text-slate-400">Use tokens de API para integrar pipelines CI/CD, scripts e ferramentas externas sem compartilhar suas credenciais de login.</p>
              <div className="rounded-lg p-3 font-mono space-y-1" style={{ background: '#020409', border: '1px solid #2a3352' }}>
                <p className="text-slate-500"># curl</p>
                <p className="text-slate-300">curl -H "Authorization: Bearer gst_..." https://backend/api/executions</p>
                <p className="text-slate-500 mt-2"># GitHub Actions</p>
                <p className="text-slate-300">{'- run: curl -H "Authorization: Bearer ${{ secrets.GOSTATE_TOKEN }}" ...'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tokens count */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Tokens ativos
            <span className="ml-2 text-xs font-normal text-slate-500">({tokens.length}/20)</span>
          </h2>
          {tokens.length > 0 && (
            <div className="flex gap-1">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ background: i < tokens.length ? 'rgba(124,58,237,0.7)' : '#1e2a3a' }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Token list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: '#0a0f1a', border: '1px dashed #2a3352' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(124,58,237,0.1)' }}>
              <KeyRound className="w-7 h-7 text-cyan-600" />
            </div>
            <p className="text-slate-400 font-medium mb-1">Nenhum token criado</p>
            <p className="text-sm text-slate-600 mb-5 text-center max-w-xs">Crie um token para integrar CI/CD pipelines, GitHub Actions ou scripts externos com a API do goState</p>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'rgba(124,58,237,0.25)', color: '#22d3ee', border: '1px solid rgba(124,58,237,0.4)' }}
              onClick={() => setShowNewModal(true)}
            >
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
                  className="flex items-center gap-4 px-5 py-4 rounded-xl transition-all"
                  style={{
                    background: '#0d1117',
                    border: `1px solid ${expired ? 'rgba(239,68,68,0.2)' : '#1e2a3a'}`,
                    opacity: expired ? 0.65 : 1,
                  }}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${expired ? 'bg-red-500/10' : 'bg-cyan-500/10'}`}>
                    <KeyRound className={`w-4 h-4 ${expired ? 'text-red-400' : 'text-cyan-400'}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-white truncate">{token.name}</span>
                      {expired && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-500/15 text-red-400 border border-red-500/20">
                          Expirado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <code className="font-mono text-cyan-400">{token.token_prefix}••••••••</code>
                      <span className="text-slate-600">Criado: {formatDate(token.created_at)}</span>
                      {token.last_used_at && <span className="text-slate-600">Último uso: {formatDate(token.last_used_at)}</span>}
                      {token.expires_at
                        ? <span className={expired ? 'text-red-400' : 'text-slate-600'}>Expira: {formatDate(token.expires_at)}</span>
                        : <span className="text-slate-700">Sem expiração</span>
                      }
                    </div>
                  </div>

                  {/* Delete */}
                  {deletingId === token.id ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-500">Revogar?</span>
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20"
                        onClick={() => remove.mutate(token.id)}
                        disabled={remove.isPending}
                      >
                        {remove.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim, revogar'}
                      </button>
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
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
