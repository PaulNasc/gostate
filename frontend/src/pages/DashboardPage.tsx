import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { statsApi, executionsApi, API_BASE } from '../lib/api';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import { FolderOpen, PlayCircle, Server, TrendingUp, TestTube2, Layers, Loader2, ArrowRight } from 'lucide-react';
import { io as socketIo } from 'socket.io-client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from 'recharts';

export default function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.get(),
    refetchInterval: 30000,
  });

  const { data: liveData } = useQuery({
    queryKey: ['executions-live'],
    queryFn: () => executionsApi.list({ status: 'running', limit: 10 }),
    refetchInterval: 3000,
  });
  const liveExecs: any[] = liveData?.data?.executions || [];

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token) return;
    const socket = socketIo(API_BASE, { auth: { token } });
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['executions-live'] });
    };
    socket.on('exec:started', refresh);
    socket.on('exec:finished', refresh);
    socket.on('exec:update', refresh);
    return () => { socket.disconnect(); };
  }, [qc]);

  const s = data?.data;

  const passRate = s?.executions?.pass_rate ?? 0;
  const chartData = (s?.last7days ?? []).map((d: any) => ({
    day: d.day?.slice(5) ?? '',
    Passou: d.passed ?? 0,
    Falhou: d.failed ?? 0,
    Total: d.total ?? 0,
  })).filter((d: any) => d.day);

  const allBarData = [
    { name: 'Passou', value: s?.executions?.passed ?? 0, color: '#10b981' },
    { name: 'Falhou', value: s?.executions?.failed ?? 0, color: '#ef4444' },
    { name: 'Erro', value: s?.executions?.error ?? 0, color: '#f59e0b' },
    { name: 'Rodando', value: s?.executions?.running ?? 0, color: '#3b82f6' },
    { name: 'Cancelado', value: s?.executions?.cancelled ?? 0, color: '#64748b' },
  ];
  const barData = allBarData.filter(d => d.value > 0);

  const tooltipStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Visão geral da plataforma</p>
      </div>

      {/* Live running banner */}
      {liveExecs.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 transition-colors"
          onClick={() => navigate('/executions')}
        >
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-blue-400">{liveExecs.length} execução{liveExecs.length !== 1 ? 'ões' : ''} em andamento</span>
            <span className="text-xs ml-2 truncate" style={{ color: 'var(--text-muted)' }}>
              {liveExecs.slice(0, 3).map((e: any) => e.tc_title || e.script_filename || `#${e.id.slice(0, 8)}`).join(', ')}
              {liveExecs.length > 3 ? ` +${liveExecs.length - 3}` : ''}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard icon={FolderOpen} label="Projetos" value={s?.projects ?? '—'} color="blue" onClick={() => navigate('/projects')} />
        <StatCard icon={Layers} label="Suites" value={s?.suites ?? '—'} color="indigo" />
        <StatCard icon={TestTube2} label="Casos de Teste" value={s?.test_cases ?? '—'} color="purple" />
        <StatCard icon={PlayCircle} label="Execuções" value={s?.executions?.total ?? '—'} color="cyan" onClick={() => navigate('/executions')} />
        <StatCard
          icon={TrendingUp}
          label="Pass Rate"
          value={s ? `${passRate}%` : '—'}
          color={passRate >= 80 ? 'green' : passRate >= 50 ? 'yellow' : 'red'}
        />
        <StatCard
          icon={Server}
          label="Agentes"
          value={s ? `${s.agents.online}/${s.agents.total}` : '—'}
          color={s?.agents?.online > 0 ? 'green' : 'slate'}
          onClick={() => navigate('/agents')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7-day Line Chart */}
        <div className="card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Execuções — últimos 7 dias</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text)' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                <Line type="monotone" dataKey="Passou" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Falhou" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-600 text-sm">
              {isLoading ? 'Carregando...' : 'Sem dados nos últimos 7 dias'}
            </div>
          )}
        </div>

        {/* Bar totals */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Resultado total</h2>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barSize={32} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text)' }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} label={{ position: 'top', fill: 'var(--text-muted)', fontSize: 11 }}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Sem execuções</div>
          )}
        </div>
      </div>

      {/* Recent Executions — fixed 8 rows, no scroll */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Execuções Recentes</h2>
          <button
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            onClick={() => navigate('/executions')}
          >
            Ver todas <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
        ) : !s?.recent?.length ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma execução encontrada</div>
        ) : (
          <div className="space-y-0.5 overflow-hidden">
            {(s.recent as any[]).slice(0, 8).map((exec: any) => (
              <div
                key={exec.id}
                className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => navigate(`/executions/${exec.id}`)}
              >
                <span className={`${statusBadgeClass(exec.status)} w-20 justify-center flex-shrink-0`}>{statusLabel(exec.status)}</span>
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>
                  {exec.tc_title || exec.script_filename || <span className="font-mono text-xs">{exec.id.slice(0, 8)}</span>}
                </span>
                {exec.project_name && (
                  <span className="text-xs px-1.5 py-0.5 rounded hidden md:block" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                    {exec.project_name}
                  </span>
                )}
                <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>{exec.agent_name || '—'}</span>
                <span className="text-xs font-mono w-12 text-right flex-shrink-0" style={{ color: 'var(--text)' }}>{formatDuration(exec.duration_ms)}</span>
                <span className="text-xs w-32 text-right flex-shrink-0 hidden lg:block" style={{ color: 'var(--text-muted)' }}>{formatDate(exec.created_at)}</span>
              </div>
            ))}
          </div>
        )}
        {(s?.recent?.length ?? 0) > 0 && (
          <div className="mt-3 pt-3 border-t text-center" style={{ borderColor: 'var(--border)' }}>
            <button
              className="text-xs transition-colors hover:text-blue-300 text-blue-400"
              onClick={() => navigate('/executions')}
            >
              Ver todas as execuções →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick }: any) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    green: 'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red: 'text-red-400 bg-red-500/10',
    slate: 'text-slate-400 bg-slate-500/10',
  };
  return (
    <div
      className={`card p-4 ${onClick ? 'cursor-pointer hover:border-blue-500/40 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color] || colorMap.slate}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
