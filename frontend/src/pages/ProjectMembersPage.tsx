import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectMembersApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, Trash2, Loader2, Users, Shield, Eye, Pencil, X } from 'lucide-react';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/utils';

const ROLES = [
  { value: 'viewer', label: 'Visualizador', icon: Eye, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
  { value: 'editor', label: 'Editor', icon: Pencil, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { value: 'admin', label: 'Admin', icon: Shield, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
] as const;

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find(x => x.value === role) || ROLES[0];
  const Icon = r.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${r.bg} ${r.color}`}>
      <Icon className="w-2.5 h-2.5" /> {r.label}
    </span>
  );
}

export default function ProjectMembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');

  const { data, isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projectMembersApi.list(projectId!),
  });
  const members: any[] = data?.data?.members || [];

  const add = useMutation({
    mutationFn: () => projectMembersApi.add(projectId!, { email, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      toast.success('Membro adicionado');
      setEmail(''); setRole('viewer'); setShowForm(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Erro ao adicionar membro'),
  });

  const updateRole = useMutation({
    mutationFn: ({ memberId, newRole }: { memberId: string; newRole: string }) =>
      projectMembersApi.updateRole(projectId!, memberId, newRole),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-members', projectId] }); toast.success('Role atualizada'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Erro ao atualizar role'),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => projectMembersApi.remove(projectId!, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-members', projectId] }); toast.success('Membro removido'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Erro ao remover membro'),
  });

  const isAdmin = user?.role === 'admin';

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Users className="w-5 h-5 text-violet-400" /> Membros do Projeto
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Gerencie quem pode acessar e editar este projeto
            </p>
          </div>
        </div>
        {isAdmin && (
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-4 h-4" /> Convidar
          </button>
        )}
      </div>

      {/* Invite form */}
      {showForm && isAdmin && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Convidar membro</p>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="E-mail do usuário"
              type="email"
              value={email}
              autoFocus
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && email.trim()) add.mutate(); }}
            />
            <select
              className="input text-sm py-2"
              value={role}
              onChange={e => setRole(e.target.value as any)}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button
              className="btn-primary flex items-center gap-1.5 text-sm"
              disabled={!email.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Convidar
            </button>
            <button className="btn-ghost p-2" onClick={() => { setShowForm(false); setEmail(''); }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            {ROLES.map(r => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${r.value === role ? `${r.bg} ${r.color}` : 'border-transparent'}`}
                  style={r.value !== role ? { color: 'var(--text-muted)', borderColor: 'var(--border)' } : {}}
                >
                  <Icon className="w-3 h-3" /> {r.label}
                  {r.value === 'viewer' && <span className="ml-1 opacity-60">— leitura</span>}
                  {r.value === 'editor' && <span className="ml-1 opacity-60">— criar/editar TCs</span>}
                  {r.value === 'admin' && <span className="ml-1 opacity-60">— gerenciar membros</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse" style={{ background: 'var(--surface-2)' }} />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>Nenhum membro adicionado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Convide colaboradores para trabalhar neste projeto
          </p>
          {isAdmin && (
            <button className="btn-primary mt-4 text-sm flex items-center gap-2 mx-auto" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> Convidar primeiro membro
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Usuário</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-36" style={{ color: 'var(--text-muted)' }}>Role</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider w-36" style={{ color: 'var(--text-muted)' }}>Adicionado em</th>
                {isAdmin && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => (
                <tr
                  key={m.id}
                  className="border-b transition-colors group"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: 'var(--text)' }}>{m.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && m.user_id !== user?.id ? (
                      <select
                        className="input text-xs py-1 px-2"
                        value={m.role}
                        onChange={e => updateRole.mutate({ memberId: m.id, newRole: e.target.value })}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(m.created_at)}
                    {m.invited_by_name && (
                      <p className="mt-0.5">por {m.invited_by_name}</p>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {m.user_id !== user?.id && (
                        <button
                          className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onClick={() => { if (confirm(`Remover ${m.name}?`)) remove.mutate(m.id); }}
                          title="Remover membro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role legend */}
      <div className="flex flex-wrap gap-3 pt-2">
        {ROLES.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.value} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${r.bg} ${r.color}`}>
              <Icon className="w-3 h-3" />
              <span className="font-medium">{r.label}</span>
              <span className="opacity-60">
                {r.value === 'viewer' ? '— somente leitura' : r.value === 'editor' ? '— criar e editar' : '— acesso total'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
