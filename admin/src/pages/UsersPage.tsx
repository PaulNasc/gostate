import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Pencil, Loader2, CheckCircle2, X } from 'lucide-react';
import { usersApi } from '../api';

const ROLES = ['admin', 'tester'];

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`badge ${role === 'admin' ? 'badge-admin' : 'badge-tester'}`}>
      {role === 'admin' ? 'Admin' : 'Testador'}
    </span>
  );
}

function UserForm({
  initial,
  onSave,
  onCancel,
  saving,
  isEdit = false,
}: {
  initial?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initial?.role || 'tester');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { name, email, role };
    if (password) data.password = password;
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Nome</label>
          <input className="input" placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">E-mail</label>
          <input className="input" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">{isEdit ? 'Nova Senha (opcional)' : 'Senha'}</label>
          <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required={!isEdit} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Papel</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r === 'admin' ? 'Administrador' : 'Testador'}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {isEdit ? 'Salvar' : 'Criar'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => usersApi.list() });
  const users: any[] = data?.data?.users || [];

  const create = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowForm(false); showToast('Usuário criado'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Erro ao criar usuário', 'error'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditingId(null); showToast('Usuário atualizado'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Erro ao atualizar', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); showToast('Usuário removido'); },
    onError: () => showToast('Erro ao remover usuário', 'error'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => usersApi.update(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: () => showToast('Erro ao alterar status', 'error'),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" /> Gerenciar Usuários
          </h1>
          <p className="text-sm text-slate-400 mt-1">Crie e gerencie contas de usuários e administradores</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(!showForm); setEditingId(null); }}>
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {showForm && !editingId && (
        <UserForm onSave={(d) => create.mutate(d)} onCancel={() => setShowForm(false)} saving={create.isPending} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : users.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhum usuário cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id}>
              {editingId === user.id ? (
                <UserForm
                  initial={user}
                  isEdit
                  onSave={(d) => update.mutate({ id: user.id, data: d })}
                  onCancel={() => setEditingId(null)}
                  saving={update.isPending}
                />
              ) : (
                <div className="card p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                      style={{ background: user.role === 'admin' ? '#7c3aed' : '#2563eb' }}>
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{user.name || '—'}</span>
                        <RoleBadge role={user.role} />
                        {user.active === false && (
                          <span className="badge bg-red-500/10 text-red-400">Desativado</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          user.active === false
                            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            : 'bg-slate-700/40 text-slate-400 hover:bg-slate-700/60'
                        }`}
                        onClick={() => toggleActive.mutate({ id: user.id, active: user.active === false })}
                        title={user.active === false ? 'Ativar conta' : 'Desativar conta'}
                      >
                        {user.active === false ? 'Ativar' : 'Desativar'}
                      </button>
                      <button
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                        title="Editar"
                        onClick={() => { setEditingId(user.id); setShowForm(false); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remover"
                        onClick={() => { if (confirm(`Remover "${user.name || user.email}"?`)) remove.mutate(user.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
