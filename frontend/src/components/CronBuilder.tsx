import { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const PRESETS = [
  { label: 'A cada 5 min',          value: '*/5 * * * *' },
  { label: 'A cada 10 min',         value: '*/10 * * * *' },
  { label: 'A cada 15 min',         value: '*/15 * * * *' },
  { label: 'A cada 30 min',         value: '*/30 * * * *' },
  { label: 'A cada hora',           value: '0 * * * *' },
  { label: 'A cada 2 horas',        value: '0 */2 * * *' },
  { label: 'A cada 6 horas',        value: '0 */6 * * *' },
  { label: 'A cada 12 horas',       value: '0 */12 * * *' },
  { label: 'Diariamente às 6h',     value: '0 6 * * *' },
  { label: 'Diariamente às 8h',     value: '0 8 * * *' },
  { label: 'Diariamente às 18h',    value: '0 18 * * *' },
  { label: 'Diariamente à meia-noite', value: '0 0 * * *' },
  { label: 'Seg–Sex às 9h',         value: '0 9 * * 1-5' },
  { label: 'Toda segunda às 9h',    value: '0 9 * * 1' },
  { label: 'Toda semana (dom 0h)',   value: '0 0 * * 0' },
  { label: 'Primeiro dia do mês',   value: '0 8 1 * *' },
  { label: 'Personalizado',         value: '__custom__' },
];

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function parseCronField(field: string, max: number): number[] {
  const results: number[] = [];
  if (field === '*') {
    for (let i = 0; i <= max; i++) results.push(i);
    return results;
  }
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/');
      const step = parseInt(stepStr);
      const [start, end] = rangeStr === '*'
        ? [0, max]
        : rangeStr.split('-').map(Number);
      for (let i = start; i <= end; i += step) results.push(i);
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) results.push(i);
    } else {
      results.push(parseInt(part));
    }
  }
  return [...new Set(results)].filter(n => !isNaN(n));
}

function getNextRuns(expr: string, count = 5): Date[] {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return [];
    const [minF, hourF, domF, monF, dowF] = parts;

    const minutes  = parseCronField(minF,  59);
    const hours    = parseCronField(hourF, 23);
    const doms     = parseCronField(domF,  31);
    const months   = parseCronField(monF,  12);
    const dows     = parseCronField(dowF,  6);

    const runs: Date[] = [];
    const now = new Date();
    const cursor = new Date(now);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    const domStar = domF === '*';
    const dowStar = dowF === '*';

    let safety = 0;
    while (runs.length < count && safety < 527040) {
      safety++;
      const mon  = cursor.getMonth() + 1;
      const dom  = cursor.getDate();
      const dow  = cursor.getDay();
      const hour = cursor.getHours();
      const min  = cursor.getMinutes();

      if (!months.includes(mon)) { cursor.setMonth(cursor.getMonth() + 1, 1); cursor.setHours(0, 0, 0, 0); continue; }

      const domOk = domStar || doms.includes(dom);
      const dowOk = dowStar || dows.includes(dow);
      const dayOk = (!domStar && !dowStar) ? (domOk || dowOk) : (domOk && dowOk);

      if (!dayOk) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(0, 0, 0, 0); continue; }
      if (!hours.includes(hour)) { cursor.setHours(cursor.getHours() + 1, 0, 0, 0); continue; }
      if (!minutes.includes(min)) { cursor.setMinutes(cursor.getMinutes() + 1, 0, 0); continue; }

      runs.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
    }
    return runs;
  } catch {
    return [];
  }
}

function humanizeCron(expr: string): string {
  const preset = PRESETS.find(p => p.value === expr && p.value !== '__custom__');
  if (preset) return preset.label;

  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return expr;
    const [min, hour, dom, mon, dow] = parts;

    if (min.startsWith('*/')) return `A cada ${min.slice(2)} min`;
    if (hour.startsWith('*/') && min === '0') return `A cada ${hour.slice(2)}h`;
    if (dom === '*' && mon === '*' && dow === '*' && !min.includes('*') && !hour.includes('*'))
      return `Diariamente às ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`;
    if (dom === '*' && mon === '*' && !dow.includes('*') && min === '0' && !hour.includes('*')) {
      const days = parseCronField(dow, 6).map(d => DOW_LABELS[d]).join(', ');
      return `${days} às ${hour.padStart(2,'0')}h`;
    }
    if (dom !== '*' && mon === '*' && dow === '*' && min === '0' && !hour.includes('*'))
      return `Dia ${dom} de cada mês às ${hour.padStart(2,'0')}h`;
    if (mon !== '*' && dom !== '*' && dow === '*' && min === '0' && !hour.includes('*')) {
      const months = parseCronField(mon, 12).map(m => MONTH_LABELS[m - 1]).join(', ');
      return `Dia ${dom} de ${months} às ${hour.padStart(2,'0')}h`;
    }
  } catch { /* fall through */ }
  return expr;
}

function formatRunDate(d: Date): string {
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  let dateStr = '';
  if (isToday) dateStr = 'Hoje';
  else if (isTomorrow) dateStr = 'Amanhã';
  else dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

  let relStr = '';
  if (diffMin < 60) relStr = `em ${diffMin}min`;
  else if (diffMin < 1440) relStr = `em ${Math.round(diffMin / 60)}h`;
  else relStr = `em ${Math.round(diffMin / 1440)}d`;

  return `${dateStr} às ${timeStr} (${relStr})`;
}

interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CronBuilder({ value, onChange }: CronBuilderProps) {
  const isCustom = !PRESETS.find(p => p.value === value && p.value !== '__custom__');
  const [mode, setMode] = useState<'preset' | 'custom'>(isCustom ? 'custom' : 'preset');
  const [showPreview, setShowPreview] = useState(false);
  const [customValue, setCustomValue] = useState(isCustom ? value : '');

  useEffect(() => {
    const isPreset = PRESETS.find(p => p.value === value && p.value !== '__custom__');
    if (!isPreset) {
      setMode('custom');
      setCustomValue(value);
    }
  }, [value]);

  const nextRuns = getNextRuns(value);
  const isValid = nextRuns.length > 0;

  const handlePresetChange = (v: string) => {
    if (v === '__custom__') {
      setMode('custom');
      setCustomValue(value !== '__custom__' ? value : '0 8 * * *');
      if (value !== '__custom__') onChange(value);
    } else {
      setMode('preset');
      onChange(v);
    }
  };

  const handleCustomChange = (v: string) => {
    setCustomValue(v);
    onChange(v);
  };

  return (
    <div className="space-y-2">
      {/* Selector */}
      <div className="flex gap-2">
        {mode === 'preset' ? (
          <select
            className="input flex-1 text-sm"
            value={value}
            onChange={e => handlePresetChange(e.target.value)}
          >
            {PRESETS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        ) : (
          <div className="flex-1 flex gap-2">
            <input
              className={`input flex-1 font-mono text-sm ${!isValid && customValue ? 'border-red-500/60' : ''}`}
              placeholder="* * * * *"
              value={customValue}
              onChange={e => handleCustomChange(e.target.value)}
            />
            <button
              className="btn-ghost text-xs px-2 flex-shrink-0"
              onClick={() => { setMode('preset'); onChange(PRESETS[6].value); }}
              title="Voltar para presets"
            >
              ←
            </button>
          </div>
        )}

        <button
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all flex-shrink-0 ${showPreview ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-transparent hover:border-white/10'}`}
          style={!showPreview ? { color: 'var(--text-muted)', borderColor: 'var(--border)' } : {}}
          onClick={() => setShowPreview(v => !v)}
          title="Ver próximas execuções"
        >
          <Calendar className="w-3.5 h-3.5" />
          {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Human description */}
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        {isValid ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="font-mono text-blue-400">{value}</span>
            {' — '}
            <span>{humanizeCron(value)}</span>
          </p>
        ) : (
          <p className="text-xs text-red-400">Expressão cron inválida</p>
        )}
      </div>

      {/* Preview panel */}
      {showPreview && isValid && (
        <div
          className="rounded-xl border p-3 space-y-1.5"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            Próximas {nextRuns.length} execuções
          </p>
          {nextRuns.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}
              >
                {i + 1}
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>
                {formatRunDate(d)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
