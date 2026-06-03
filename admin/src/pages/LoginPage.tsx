import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { authApi } from '../api';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      const { token, user } = res.data;
      if (user.role !== 'admin') {
        setError('Acesso restrito a administradores.');
        return;
      }
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_user', JSON.stringify(user));
      onLogin();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0d14' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <svg viewBox="0 0 100 100" width="48" height="48" className="mb-4" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="20" fill="#09090b" />
            <path d="M 48,7 Q 58,7 58,17 V 48" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M 55,42 H 83 Q 93,42 93,52 V 83 Q 93,93 83,93 H 55 Q 42,93 42,83 V 55 Q 42,42 55,42 Z" stroke="#8b5cf6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <line x1="56" y1="54" x2="56" y2="80" stroke="#8b5cf6" strokeWidth="7" strokeLinecap="round" />
            <line x1="66" y1="70" x2="82" y2="70" stroke="#8b5cf6" strokeWidth="7" strokeLinecap="round" />
            <path d="M 58,48 Q 58,58 48,58 H 17 Q 7,58 7,48 V 17 Q 7,7 17,7 H 48" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <line x1="19" y1="28" x2="46" y2="28" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
            <line x1="19" y1="40" x2="38" y2="40" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
          </svg>
          <h1 className="text-xl font-bold text-white">goState Admin</h1>
          <p className="text-sm text-slate-400 mt-1">Painel de administração — acesso restrito</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail</label>
            <input
              className="input"
              type="email"
              placeholder="admin@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Senha</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          goState Admin Panel · porta 4001
        </p>
      </div>
    </div>
  );
}
