import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Loader2, ShieldCheck, Eye, TestTube2, Pencil, RotateCcw, X } from 'lucide-react';

const ROLES = ['admin', 'tester', 'viewer'] as const;

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'tester' as typeof ROLES[number] });
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'tester' as typeof ROLES[number], password: '' });

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const users: any[] = data?.data?.users || [];

  const create = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); setForm({ name: '', email: '', password: '', role: 'tester' }); },
  });

  const update = useMutation({
    mutationFn: (data: any) => usersApi.update(editUser.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => usersApi.update(id, { active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => usersApi.update(id, { active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const openEdit = (user: any) => {
    setEditUser(user);
    setEditForm({ name: user.name, role: user.role, password: '' });
  };

  const roleIcon = (role: string) => {
    if (role === 'admin') return <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />;
    if (role === 'tester') return <TestTube2 className="w-3.5 h-3.5 text-teal-400" />;
    return <Eye className="w-3.5 h-3.5 text-slate-400" />;
  };

  const roleColor = (role: string) => {
    if (role === 'admin') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (role === 'tester') return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Usuários</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Novo Usuário</h3>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Nome completo *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className="input" type="email" placeholder="Email *" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className="input" type="password" placeholder="Senha *" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as typeof ROLES[number] }))}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex items-center gap-2" disabled={!form.name || !form.email || !form.password || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
          {create.isError && <p className="text-xs text-red-400">{(create.error as any)?.response?.data?.error}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Nome</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Email</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Perfil</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Criado em</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b transition-colors group" style={{ borderColor: 'var(--border)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-400">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${roleColor(user.role)}`}>
                      {roleIcon(user.role)}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${user.active ? 'text-green-400' : 'text-slate-600'}`}>
                      {user.active ? '● Ativo' : '● Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(user.created_at)}</td>
                  <td className="px-4 py-3 flex items-center gap-1">
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-blue-500/10 hover:text-blue-400 transition-all" style={{ color: 'var(--text-muted)' }}
                      onClick={() => openEdit(user)}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {user.active ? (
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 hover:text-red-400 transition-all" style={{ color: 'var(--text-muted)' }}
                        onClick={() => { if (confirm('Desativar usuário?')) deactivate.mutate(user.id); }}
                        title="Desativar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-green-500/10 hover:text-green-400 transition-all" style={{ color: 'var(--text-muted)' }}
                        onClick={() => reactivate.mutate(user.id)}
                        title="Reativar"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditUser(null)}>
          <div className="card p-6 w-full max-w-sm mx-4 space-y-4" style={{ background: 'var(--surface-2)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Editar Usuário</h3>
              <button className="btn-ghost p-1.5" onClick={() => setEditUser(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Nome</label>
                <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Perfil</label>
                <select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as typeof ROLES[number] }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Nova senha <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>(deixe vazio para manter)</span></label>
                <input className="input" type="password" placeholder="••••••••" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            </div>
            {update.isError && <p className="text-xs text-red-400">{(update.error as any)?.response?.data?.error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={update.isPending}
                onClick={() => {
                  const payload: any = { name: editForm.name, role: editForm.role };
                  if (editForm.password) payload.password = editForm.password;
                  update.mutate(payload);
                }}
              >
                {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
              </button>
              <button className="btn-ghost" onClick={() => setEditUser(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
