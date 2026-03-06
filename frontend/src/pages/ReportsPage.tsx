import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { executionsApi, projectsApi } from '../lib/api';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import {
  BarChart3, CheckCircle2, XCircle, AlertCircle, Clock,
  Loader2, ExternalLink, Download, ChevronDown, Calendar
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type PeriodKey = '1' | '7' | '30' | '90' | 'custom';
const PERIOD_OPTS: { key: PeriodKey; label: string }[] = [
  { key: '1', label: 'Hoje' },
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'custom', label: 'Intervalo' },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [filterProject, setFilterProject] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() });
  const projects: any[] = projectsData?.data?.projects || [];

  const { data: execData, isLoading } = useQuery({
    queryKey: ['executions-report', filterProject],
    queryFn: () => executionsApi.list({ limit: 500, ...(filterProject ? { project_id: filterProject } : {}) }),
    refetchInterval: 30000,
  });
  const allExecs: any[] = execData?.data?.executions || [];

  const now = Date.now();
  const execs = allExecs.filter(e => {
    if (!e.created_at) return false;
    const t = new Date(e.created_at.replace(' ', 'T') + (e.created_at.includes('T') ? '' : 'Z')).getTime();
    if (isNaN(t)) return false;
    if (period === 'custom') {
      const from = customFrom ? new Date(customFrom).getTime() : 0;
      const to = customTo ? new Date(customTo + 'T23:59:59').getTime() : Infinity;
      return t >= from && t <= to;
    }
    const days = parseInt(period);
    return now - t < days * 86400000;
  });

  const total = execs.length;
  const passed = execs.filter(e => e.status === 'passed').length;
  const failed = execs.filter(e => e.status === 'failed').length;
  const errored = execs.filter(e => e.status === 'error').length;
  const cancelled = execs.filter(e => e.status === 'cancelled').length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const withDur = execs.filter(e => e.duration_ms);
  const avgDuration = withDur.length > 0
    ? Math.round(withDur.reduce((s, e) => s + e.duration_ms, 0) / withDur.length)
    : 0;

  const byDay: Record<string, { passed: number; failed: number; error: number }> = {};
  execs.forEach(e => {
    const day = (e.created_at || '').slice(0, 10);
    if (!day) return;
    if (!byDay[day]) byDay[day] = { passed: 0, failed: 0, error: 0 };
    if (e.status === 'passed') byDay[day].passed++;
    else if (e.status === 'failed') byDay[day].failed++;
    else if (e.status === 'error') byDay[day].error++;
  });
  const dayChart = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, d]) => ({
    day: day.slice(5), Passou: d.passed, Falhou: d.failed, Erro: d.error,
  }));

  const pieData = [
    { name: 'Passou', value: passed, color: '#10b981' },
    { name: 'Falhou', value: failed, color: '#ef4444' },
    { name: 'Erro', value: errored, color: '#f59e0b' },
    { name: 'Cancelado', value: cancelled, color: '#64748b' },
  ].filter(d => d.value > 0);

  const byTc: Record<string, { title: string; total: number; passed: number; failed: number; lastStatus: string; lastAt: string }> = {};
  execs.forEach(e => {
    if (!e.tc_title) return;
    const key = e.test_case_id || e.tc_title;
    if (!byTc[key]) byTc[key] = { title: e.tc_title, total: 0, passed: 0, failed: 0, lastStatus: '', lastAt: '' };
    byTc[key].total++;
    if (e.status === 'passed') byTc[key].passed++;
    else if (e.status === 'failed') byTc[key].failed++;
    if (!byTc[key].lastAt || e.created_at > byTc[key].lastAt) {
      byTc[key].lastAt = e.created_at;
      byTc[key].lastStatus = e.status;
    }
  });
  const tcRows = Object.values(byTc).sort((a, b) => b.total - a.total);

  function exportExcel() {
    setShowExportMenu(false);
    const rows = execs.map(e => ({
      'Status': statusLabel(e.status),
      'Caso / Script': e.tc_title || e.script_filename || e.id.slice(0, 8),
      'Projeto': e.project_name || '—',
      'Agente': e.agent_name || '—',
      'Browser': (e.browsers || ['—'])[0],
      'Duração (ms)': e.duration_ms || 0,
      'Data': formatDate(e.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Execuções');
    const tcSheet = XLSX.utils.json_to_sheet(tcRows.map(tc => ({
      'Caso de Teste': tc.title,
      'Total': tc.total,
      'Passaram': tc.passed,
      'Falharam': tc.failed,
      'Pass Rate %': Math.round((tc.passed / tc.total) * 100),
      'Último Status': statusLabel(tc.lastStatus),
      'Última Execução': formatDate(tc.lastAt),
    })));
    XLSX.utils.book_append_sheet(wb, tcSheet, 'Por Caso de Teste');
    XLSX.writeFile(wb, `gostate-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPDF() {
    setShowExportMenu(false);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('goState — Relatório de Execuções', 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Total: ${total} · Pass Rate: ${passRate}%`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Status', 'Caso / Script', 'Projeto', 'Agente', 'Duração', 'Data']],
      body: execs.slice(0, 200).map(e => [
        statusLabel(e.status),
        e.tc_title || e.script_filename || e.id.slice(0, 8),
        e.project_name || '—',
        e.agent_name || '—',
        formatDuration(e.duration_ms),
        formatDate(e.created_at),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 50], textColor: 200 },
      alternateRowStyles: { fillColor: [248, 248, 255] },
    });

    if (tcRows.length > 0) {
      doc.addPage();
      doc.setFontSize(13);
      doc.setTextColor(40);
      doc.text('Desempenho por Caso de Teste', 14, 15);
      autoTable(doc, {
        startY: 22,
        head: [['Caso de Teste', 'Total', 'Passaram', 'Falharam', 'Pass Rate', 'Último Status', 'Última Execução']],
        body: tcRows.map(tc => [
          tc.title,
          tc.total,
          tc.passed,
          tc.failed,
          `${Math.round((tc.passed / tc.total) * 100)}%`,
          statusLabel(tc.lastStatus),
          formatDate(tc.lastAt),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 30, 50], textColor: 200 },
      });
    }

    doc.save(`gostate-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const periodLabel = period === 'custom'
    ? (customFrom || customTo ? `${customFrom || '...'} → ${customTo || '...'}` : 'Intervalo')
    : PERIOD_OPTS.find(o => o.key === period)?.label || '';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Relatórios</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Análise consolidada de execuções e qualidade</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Project filter */}
          {projects.length > 0 && (
            <select
              className="text-xs rounded-lg px-3 py-1.5 border outline-none transition-colors"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
            >
              <option value="">Todos os projetos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Period pills */}
          <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {PERIOD_OPTS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className="px-2.5 py-1.5 text-xs font-medium transition-all"
                style={period === opt.key
                  ? { background: 'var(--primary)', color: '#fff' }
                  : { color: 'var(--text-muted)', background: 'transparent' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs — show only when custom selected */}
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="date"
                className="text-xs rounded-lg px-2 py-1.5 border outline-none"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
              <input
                type="date"
                className="text-xs rounded-lg px-2 py-1.5 border outline-none"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
          )}

          {/* Export */}
          <div className="relative" ref={exportRef}>
            <button
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
              onClick={() => setShowExportMenu(v => !v)}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl border shadow-xl z-50 overflow-hidden min-w-[140px]"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <button
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                  style={{ color: 'var(--text)' }}
                  onClick={exportExcel}
                >
                  <span className="text-green-400">⊞</span> Excel (.xlsx)
                </button>
                <button
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-t"
                  style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
                  onClick={exportPDF}
                >
                  <span className="text-red-400">⬚</span> PDF (.pdf)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : total === 0 ? (
        <div className="card p-12 text-center">
          <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma execução {period === 'custom' ? 'no intervalo selecionado' : `nos últimos ${periodLabel}`}</p>
          <p className="text-sm text-slate-600 mt-1">Ajuste o período ou execute testes para ver os dados aqui</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{total}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pass Rate</p>
              <p className={`text-2xl font-bold ${passRate >= 80 ? 'text-green-400' : passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{passRate}%</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Passaram</p>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <p className="text-2xl font-bold text-green-400">{passed}</p>
              </div>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Falharam</p>
              <div className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-400" />
                <p className="text-2xl font-bold text-red-400">{failed}</p>
              </div>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Erros</p>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <p className="text-2xl font-bold text-amber-400">{errored}</p>
              </div>
            </div>
            <div className="card px-4 py-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Duração Média</p>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--text)' }}>{formatDuration(avgDuration)}</p>
              </div>
            </div>
          </div>

          {/* Pass Rate Bar */}
          <div className="card px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Taxa de sucesso geral</span>
              <span className={`text-sm font-bold ${passRate >= 80 ? 'text-green-400' : passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{passRate}%</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
              <div className="bg-green-500 h-full transition-all" style={{ width: `${(passed / total) * 100}%` }} />
              <div className="bg-red-500 h-full transition-all" style={{ width: `${(failed / total) * 100}%` }} />
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${(errored / total) * 100}%` }} />
            </div>
            <div className="flex gap-4 mt-2">
              <span className="text-xs text-green-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Passou</span>
              <span className="text-xs text-red-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Falhou</span>
              <span className="text-xs text-amber-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Erro</span>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {dayChart.length > 0 && (
              <div className="card p-4 lg:col-span-2">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Execuções por dia</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dayChart} barSize={14} barGap={2}>
                    <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text)' }} />
                    <Bar dataKey="Passou" stackId="a" fill="#10b981" />
                    <Bar dataKey="Falhou" stackId="a" fill="#ef4444" />
                    <Bar dataKey="Erro" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {pieData.length > 0 && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Distribuição de resultados</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Per test case table */}
          {tcRows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Desempenho por Caso de Teste</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Caso de Teste</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pass Rate</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Execuções</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Último resultado</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Última execução</th>
                  </tr>
                </thead>
                <tbody>
                  {tcRows.map((tc, i) => {
                    const rate = Math.round((tc.passed / tc.total) * 100);
                    return (
                      <tr key={i} className="border-b transition-colors" style={{ borderColor: 'var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-3 font-medium max-w-[200px] truncate" style={{ color: 'var(--text)' }}>{tc.title}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div className={`h-full rounded-full ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">{tc.passed}✓</span>
                            <span className="text-red-400">{tc.failed}✗</span>
                            <span style={{ color: 'var(--text-muted)' }}>/{tc.total}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`${statusBadgeClass(tc.lastStatus)} text-xs`}>{statusLabel(tc.lastStatus)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(tc.lastAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent executions */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Execuções Recentes</h2>
              <button className="text-xs text-blue-400 hover:text-blue-300" onClick={() => navigate('/executions')}>Ver todas →</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Caso / Script</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Agente</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Duração</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Data</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {execs.slice(0, 10).map(exec => (
                  <tr key={exec.id} className="border-b transition-colors cursor-pointer"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => navigate(`/executions/${exec.id}`)}
                  >
                    <td className="px-4 py-2.5"><span className={`${statusBadgeClass(exec.status)} text-xs`}>{statusLabel(exec.status)}</span></td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate text-sm" style={{ color: 'var(--text)' }}>{exec.tc_title || exec.script_filename || exec.id.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{exec.agent_name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text)' }}>{formatDuration(exec.duration_ms)}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(exec.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
