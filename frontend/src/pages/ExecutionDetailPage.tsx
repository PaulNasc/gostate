import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionsApi, API_BASE } from '../lib/api';
import { useToast } from '../components/Toast';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import { io as socketIo } from 'socket.io-client';
import {
  ArrowLeft, RefreshCw, X, CheckCircle2, XCircle, Clock, Loader2,
  FileVideo, FileText, Image, Terminal, ChevronDown, ChevronRight, Download, RotateCcw
} from 'lucide-react';

export default function ExecutionDetailPage() {
  const { execId } = useParams<{ execId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const logsRef = useRef<HTMLDivElement>(null);
  const [liveLogs, setLiveLogs] = useState('');
  const [tab, setTab] = useState<'logs' | 'steps' | 'artifacts'>('logs');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['execution', execId],
    queryFn: () => executionsApi.get(execId!),
    refetchInterval: (q) => {
      const status = q.state.data?.data?.execution?.status;
      return status === 'queued' || status === 'running' ? 3000 : false;
    },
  });

  const { data: logsData } = useQuery({
    queryKey: ['execution-logs', execId],
    queryFn: () => executionsApi.getLogs(execId!),
    enabled: !!execId,
  });

  const exec = data?.data?.execution;
  const steps: any[] = data?.data?.steps || [];
  const artifacts: any[] = data?.data?.artifacts || [];
  const historicLogs: string = logsData?.data?.logs || '';

  const cancel = useMutation({
    mutationFn: () => executionsApi.cancel(execId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['execution', execId] }); refetch(); toast.info('Execução cancelada'); },
    onError: () => toast.error('Erro ao cancelar execução'),
  });

  const rerun = useMutation({
    mutationFn: () => executionsApi.create({
      test_case_id: exec?.test_case_id || undefined,
      script_id: exec?.script_id || undefined,
      browsers: exec?.browsers ? JSON.parse(exec.browsers) : ['chromium'],
      video_enabled: !!exec?.video_enabled,
      screenshot_enabled: true,
      timeout: 60000,
    }),
    onSuccess: (res) => { toast.success('Re-execução criada'); navigate(`/executions/${res.data.execution.id}`); },
    onError: () => toast.error('Erro ao criar re-execução'),
  });

  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token || !execId) return;

    const socket = socketIo(API_BASE, { auth: { token } });

    socket.on('connect', () => {
      socket.emit('exec:watch', execId);
    });

    socket.on('exec:log', (payload: { execId: string; line: string }) => {
      if (payload.execId === execId) {
        setLiveLogs(prev => prev + payload.line);
        setTimeout(() => {
          logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight, behavior: 'smooth' });
        }, 50);
      }
    });

    const refreshExec = (payload: any) => {
      if (payload?.id === execId || payload?.execId === execId) {
        qc.invalidateQueries({ queryKey: ['execution', execId] });
        refetch();
      }
    };

    socket.on('exec:started', refreshExec);
    socket.on('exec:finished', refreshExec);
    socket.on('exec:update', refreshExec);
    socket.on('exec:cancelled', refreshExec);
    socket.on('exec:artifact', refreshExec);

    return () => { socket.disconnect(); };
  }, [execId, qc, refetch]);

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFABCDsuJnhliM]|\x1B\([A-Z]|\x1B=/g, '');
  const displayLogs = stripAnsi(liveLogs || historicLogs);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!exec) {
    return (
      <div className="p-6">
        <p className="text-slate-400">Execução não encontrada.</p>
      </div>
    );
  }

  const isActive = exec.status === 'queued' || exec.status === 'running';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/executions')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text)' }}>
              {exec.tc_title || exec.script_filename || `Execução #${exec.id.slice(0, 8)}`}
            </h1>
            <span className={statusBadgeClass(exec.status)}>{statusLabel(exec.status)}</span>
            {isActive && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {formatDate(exec.created_at)}
            {exec.duration_ms ? ` · ${formatDuration(exec.duration_ms)}` : ''}
            {exec.agent_name ? ` · Agente: ${exec.agent_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Cancelar
            </button>
          )}
          {!isActive && (exec?.test_case_id || exec?.script_id) && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
              onClick={() => rerun.mutate()}
              disabled={rerun.isPending}
              title="Re-executar com os mesmos parâmetros"
            >
              {rerun.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Re-executar
            </button>
          )}
          <button onClick={() => refetch()} className="btn-ghost p-2" title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics */}
      {(() => {
        const stepsTotal = steps.length;
        const stepsPassed = steps.filter((s: any) => s.status === 'passed').length;
        const stepsFailed = steps.filter((s: any) => s.status === 'failed').length;
        const stepsSkipped = stepsTotal - stepsPassed - stepsFailed;
        const passRate = stepsTotal > 0 ? Math.round((stepsPassed / stepsTotal) * 100) : (exec.status === 'passed' ? 100 : 0);
        const artifactVideos = artifacts.filter((a: any) => a.type === 'video').length;
        const artifactScreenshots = artifacts.filter((a: any) => a.type === 'screenshot').length;

        return (
          <div className="space-y-3">
            {/* Top row: key stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card px-4 py-3">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Duração</p>
                <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{exec.duration_ms ? formatDuration(exec.duration_ms) : '—'}</p>
              </div>
              <div className="card px-4 py-3">
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pass Rate</p>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-bold ${passRate >= 80 ? 'text-green-400' : passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {passRate}%
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className={`h-full rounded-full transition-all ${passRate >= 80 ? 'bg-green-500' : passRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${passRate}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="card px-4 py-3">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Steps</p>
                <div className="flex items-center gap-2">
                  {stepsTotal > 0 ? (
                    <>
                      <span className="text-xs font-semibold text-green-400">{stepsPassed}✓</span>
                      {stepsFailed > 0 && <span className="text-xs font-semibold text-red-400">{stepsFailed}✗</span>}
                      {stepsSkipped > 0 && <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{stepsSkipped}—</span>}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/ {stepsTotal}</span>
                    </>
                  ) : <span className="text-base font-bold text-slate-400">—</span>}
                </div>
              </div>
              <div className="card px-4 py-3">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Artefatos</p>
                <div className="flex items-center gap-2">
                  {artifactVideos > 0 && <span className="text-xs font-semibold text-purple-400">{artifactVideos} vídeo{artifactVideos !== 1 ? 's' : ''}</span>}
                  {artifactScreenshots > 0 && <span className="text-xs font-semibold text-blue-400">{artifactScreenshots} screenshot{artifactScreenshots !== 1 ? 's' : ''}</span>}
                  {artifacts.length === 0 && <span className="text-base font-bold text-slate-400">—</span>}
                </div>
              </div>
            </div>

            {/* Bottom row: metadata */}
            <div className="card px-4 py-3 flex flex-wrap gap-x-6 gap-y-1.5">
              {exec.browsers && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Browsers:</span>
                  {(typeof exec.browsers === 'string' ? JSON.parse(exec.browsers) : exec.browsers).map((b: string) => (
                    <span key={b} className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{b}</span>
                  ))}
                </div>
              )}
              {exec.agent_name && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Agente:</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{exec.agent_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Iniciado:</span>
                <span className="text-xs" style={{ color: 'var(--text)' }}>{exec.started_at ? formatDate(exec.started_at) : '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Concluído:</span>
                <span className="text-xs" style={{ color: 'var(--text)' }}>{exec.finished_at ? formatDate(exec.finished_at) : '—'}</span>
              </div>
              {exec.video_enabled && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">🎥 Vídeo ativado</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['logs', 'steps', 'artifacts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t
              ? 'text-blue-400 border-blue-500'
              : 'border-transparent hover:text-blue-400'
            }`}
            style={tab !== t ? { color: 'var(--text-muted)' } : undefined}
          >
            {t === 'logs' ? `Logs${liveLogs ? ' 🔴' : ''}` : t === 'steps' ? `Steps (${steps.length})` : `Artefatos (${artifacts.length})`}
          </button>
        ))}
      </div>

      {/* Tab: Logs */}
      {tab === 'logs' && (
        <div
          ref={logsRef}
          className="card rounded-lg font-mono text-xs text-green-300 p-4 overflow-y-auto"
          style={{ background: '#0a0f1a', height: '480px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        >
          {displayLogs || (
            <span className="text-slate-600">
              {isActive ? 'Aguardando logs...' : 'Nenhum log disponível.'}
            </span>
          )}
        </div>
      )}

      {/* Tab: Steps */}
      {tab === 'steps' && (
        <div className="space-y-1.5">
          {steps.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 text-sm">Nenhum step registrado</div>
          ) : (() => {
            const totalDur = steps.reduce((acc: number, s: any) => acc + (s.duration_ms || 0), 0);
            return steps.map((step: any, idx: number) => (
              <StepRow key={step.id || idx} step={step} index={idx} totalDuration={totalDur} />
            ));
          })()}
        </div>
      )}

      {/* Tab: Artifacts */}
      {tab === 'artifacts' && (
        <div className="space-y-4">
          {artifacts.length === 0 ? (
            <div className="card p-12 text-center">
              <Image className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 font-medium text-sm">Nenhum artefato disponível</p>
              <p className="text-xs text-slate-600 mt-1">Screenshots e vídeos aparecerão aqui após a execução</p>
            </div>
          ) : (
            <>
              {/* Videos */}
              {artifacts.filter((a: any) => a.type === 'video').map((art: any) => (
                <ArtifactRow key={art.id} artifact={art} />
              ))}
              {/* Screenshots grid */}
              {artifacts.filter((a: any) => a.type === 'screenshot').length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Screenshots ({artifacts.filter((a: any) => a.type === 'screenshot').length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {artifacts.filter((a: any) => a.type === 'screenshot').map((art: any) => (
                      <ScreenshotThumb key={art.id} artifact={art} />
                    ))}
                  </div>
                </div>
              )}
              {/* Other artifacts */}
              {artifacts.filter((a: any) => a.type !== 'video' && a.type !== 'screenshot').map((art: any) => (
                <ArtifactRow key={art.id} artifact={art} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, index, totalDuration }: { step: any; index: number; totalDuration: number }) {
  const [open, setOpen] = useState(false);

  const statusColorMap: Record<string, { border: string; icon: React.ReactNode; bg: string }> = {
    passed: { border: '#10b981', icon: <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />, bg: 'bg-green-500' },
    failed: { border: '#ef4444', icon: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />, bg: 'bg-red-500' },
    running: { border: '#3b82f6', icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />, bg: 'bg-blue-500' },
    skipped: { border: '#64748b', icon: <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />, bg: 'bg-slate-500' },
  };
  const statusColor = statusColorMap[step.status] || { border: '#64748b', icon: <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />, bg: 'bg-slate-500' };

  const durationPct = totalDuration > 0 && step.duration_ms
    ? Math.min(100, Math.round((step.duration_ms / totalDuration) * 100))
    : 0;

  const hasDetails = step.error_message || step.screenshot_url;

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: `3px solid ${statusColor.border}` }}
    >
      <div
        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onMouseEnter={e => hasDetails && (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => hasDetails && (e.currentTarget.style.background = 'transparent')}
        onClick={() => hasDetails && setOpen(!open)}
      >
        {statusColor.icon}
        <span className="text-xs w-5 flex-shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
        <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{step.name}</span>
        {step.type && (
          <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:block" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {step.type}
          </span>
        )}
        {step.duration_ms != null && (
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatDuration(step.duration_ms)}</span>
        )}
        {hasDetails && (
          open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>

      {/* Duration bar */}
      {durationPct > 0 && (
        <div className="h-0.5 w-full" style={{ background: 'var(--border)' }}>
          <div className={`h-full ${statusColor.bg} opacity-60`} style={{ width: `${durationPct}%` }} />
        </div>
      )}

      {open && hasDetails && (
        <div className="px-4 pb-3 pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
          {step.error_message && (
            <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all bg-red-500/5 rounded p-2 border border-red-500/20">{step.error_message}</pre>
          )}
          {step.screenshot_url && (
            <img
              src={step.screenshot_url.startsWith('http') ? step.screenshot_url : `${API_BASE}${step.screenshot_url}`}
              alt="Screenshot do step"
              className="rounded border max-w-full max-h-64 object-contain"
              style={{ borderColor: 'var(--border)' }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ArtifactRow({ artifact }: { artifact: any }) {
  const [expanded, setExpanded] = useState(false);
  const fullUrl = artifact.url ? (artifact.url.startsWith('http') ? artifact.url : `${API_BASE}${artifact.url}`) : null;

  const sizeLabel = artifact.size_bytes
    ? artifact.size_bytes > 1024 * 1024
      ? `${(artifact.size_bytes / 1024 / 1024).toFixed(1)} MB`
      : `${(artifact.size_bytes / 1024).toFixed(0)} KB`
    : '';

  const isVideo = artifact.type === 'video';
  const isScreenshot = artifact.type === 'screenshot';

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 group cursor-pointer transition-colors"
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => fullUrl && setExpanded(!expanded)}
      >
        {isVideo && <FileVideo className="w-4 h-4 text-purple-400 flex-shrink-0" />}
        {isScreenshot && <Image className="w-4 h-4 text-blue-400 flex-shrink-0" />}
        {artifact.type === 'trace' && <Terminal className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
        {!isVideo && !isScreenshot && artifact.type !== 'trace' && <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{artifact.filename}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{artifact.type}{sizeLabel ? ` · ${sizeLabel}` : ''}</p>
        </div>
        {fullUrl && (
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 btn-ghost py-1 px-2 flex items-center gap-1.5 text-xs transition-all"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-3 h-3" /> Download
          </a>
        )}
      </div>

      {expanded && fullUrl && (
        <div className="border-t p-3" style={{ borderColor: 'var(--border)', background: '#070c14' }}>
          {isScreenshot && (
            <img
              src={fullUrl}
              alt={artifact.filename}
              className="rounded-lg max-w-full border"
              style={{ borderColor: 'var(--border)', maxHeight: '480px', objectFit: 'contain' }}
            />
          )}
          {isVideo && (
            <video
              src={fullUrl}
              controls
              className="rounded-lg w-full border"
              style={{ borderColor: 'var(--border)', maxHeight: '480px', background: '#000' }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ScreenshotThumb({ artifact }: { artifact: any }) {
  const [open, setOpen] = useState(false);
  const fullUrl = artifact.url ? (artifact.url.startsWith('http') ? artifact.url : `${API_BASE}${artifact.url}`) : null;

  if (!fullUrl) return null;

  return (
    <>
      <div
        className="relative rounded-lg overflow-hidden border cursor-pointer group hover:border-blue-500/60 transition-all"
        style={{ borderColor: 'var(--border)', aspectRatio: '16/9', background: '#070c14' }}
        onClick={() => setOpen(true)}
      >
        <img
          src={fullUrl}
          alt={artifact.filename}
          className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-black/60 rounded-lg px-2 py-1">
            <Image className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative max-w-5xl w-full">
            <button
              className="absolute -top-10 right-0 text-slate-300 hover:text-white transition-colors"
              onClick={() => setOpen(false)}
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={fullUrl}
              alt={artifact.filename}
              className="rounded-lg w-full border"
              style={{ borderColor: 'var(--border)', maxHeight: '80vh', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            <p className="text-xs mt-2 text-center text-slate-300">{artifact.filename}</p>
          </div>
        </div>
      )}
    </>
  );
}
