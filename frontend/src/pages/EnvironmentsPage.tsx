import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { environmentsApi } from '../lib/api';
import { ArrowLeft, Plus, Trash2, Save, Eye, EyeOff, Loader2, Layers, X } from 'lucide-react';
import { useToast } from '../components/Toast';

interface EnvVar { key: string; value: string; secret: boolean; }

function VarRow({
  v, onChange, onRemove,
}: {
  v: EnvVar;
  onChange: (updated: EnvVar) => void;
  onRemove: () => void;
}) {
  const [showVal, setShowVal] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        className="input flex-1 text-xs font-mono py-1.5"
        placeholder="CHAVE"
        value={v.key}
        onChange={e => onChange({ ...v, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
      />
      <input
        className="input flex-1 text-xs font-mono py-1.5"
        placeholder="valor"
        type={v.secret && !showVal ? 'password' : 'text'}
        value={v.value}
        onChange={e => onChange({ ...v, value: e.target.value })}
      />
      <button
        className="p-1.5 rounded transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => setShowVal(s => !s)}
        title={showVal ? 'Ocultar' : 'Mostrar'}
      >
        {showVal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <label className="flex items-center gap-1 cursor-pointer flex-shrink-0" title="Marcar como secret (mascarado)">
        <input
          type="checkbox"
          className="rounded"
          checked={v.secret}
          onChange={e => onChange({ ...v, secret: e.target.checked })}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>secret</span>
      </label>
      <button
        className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors flex-shrink-0"
        style={{ color: 'var(--text-muted)' }}
        onClick={onRemove}
        title="Remover variável"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function EnvCard({ env, projectId }: { env: any; projectId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [vars, setVars] = useState<EnvVar[]>(env.variables || []);
  const [dirty, setDirty] = useState(false);

  const update = useMutation({
    mutationFn: () => environmentsApi.update(projectId, env.id, { name: env.name, variables: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['environments', projectId] }); setDirty(false); toast.success('Ambiente salvo'); },
    onError: () => toast.error('Erro ao salvar ambiente'),
  });

  const remove = useMutation({
    mutationFn: () => environmentsApi.remove(projectId, env.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['environments', projectId] }); toast.success('Ambiente removido'); },
    onError: () => toast.error('Erro ao remover ambiente'),
  });

  const addVar = () => { setVars(v => [...v, { key: '', value: '', secret: false }]); setDirty(true); };
  const changeVar = (i: number, updated: EnvVar) => { setVars(v => v.map((x, idx) => idx === i ? updated : x)); setDirty(true); };
  const removeVar = (i: number) => { setVars(v => v.filter((_, idx) => idx !== i)); setDirty(true); };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{env.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
            {vars.length} var{vars.length !== 1 ? 's' : ''}
          </span>
          {dirty && <span className="text-xs text-amber-400">● não salvo</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--primary)', color: '#fff' }}
            disabled={update.isPending || !dirty}
            onClick={() => update.mutate()}
          >
            {update.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Salvar
          </button>
          <button
            className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => { if (confirm(`Remover ambiente "${env.name}"?`)) remove.mutate(); }}
            title="Remover ambiente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variable rows */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_28px_80px_28px] gap-2 px-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Chave</span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Valor</span>
          <span />
          <span />
          <span />
        </div>
        {vars.length === 0 ? (
          <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>
            Nenhuma variável. Clique em "+ Variável" para adicionar.
          </p>
        ) : (
          vars.map((v, i) => (
            <VarRow key={i} v={v} onChange={u => changeVar(i, u)} onRemove={() => removeVar(i)} />
          ))
        )}
      </div>

      <button
        className="flex items-center gap-1.5 text-xs transition-colors"
        style={{ color: 'var(--primary)' }}
        onClick={addVar}
      >
        <Plus className="w-3 h-3" /> Variável
      </button>
    </div>
  );
}

export default function EnvironmentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentsApi.list(projectId!),
  });
  const envs: any[] = data?.data?.items || [];

  const create = useMutation({
    mutationFn: () => environmentsApi.create(projectId!, { name: newName, variables: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environments', projectId] });
      toast.success('Ambiente criado');
      setNewName('');
      setShowForm(false);
    },
    onError: () => toast.error('Erro ao criar ambiente'),
  });

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Layers className="w-5 h-5 text-emerald-400" /> Ambientes
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Variáveis de ambiente por contexto (dev, staging, produção)
            </p>
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4" /> Novo Ambiente
        </button>
      </div>

      {showForm && (
        <div className="card p-4 flex items-center gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Nome do ambiente (ex: Produção, Staging, Dev)"
            value={newName}
            autoFocus
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) create.mutate(); }}
          />
          <button
            className="btn-primary flex items-center gap-1.5 text-sm"
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Criar
          </button>
          <button className="btn-ghost text-sm" onClick={() => { setShowForm(false); setNewName(''); }}>Cancelar</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-4 h-24 animate-pulse" style={{ background: 'var(--surface-2)' }} />
          ))}
        </div>
      ) : envs.length === 0 ? (
        <div className="card p-12 text-center">
          <Layers className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>Nenhum ambiente criado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Crie ambientes para separar variáveis de dev, staging e produção
          </p>
          <button className="btn-primary mt-4 text-sm flex items-center gap-2 mx-auto" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Criar primeiro ambiente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {envs.map(env => (
            <EnvCard key={env.id} env={env} projectId={projectId!} />
          ))}
        </div>
      )}
    </div>
  );
}
