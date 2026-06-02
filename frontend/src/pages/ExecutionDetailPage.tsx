import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionsApi, API_BASE } from '../lib/api';
import { useToast } from '../components/Toast';
import { formatDate, formatDuration, statusBadgeClass, statusLabel } from '../lib/utils';
import { io as socketIo } from 'socket.io-client';
import {
  ArrowLeft, RefreshCw, X, CheckCircle2, XCircle, Clock, Loader2,
  FileVideo, FileText, Image, Terminal, ChevronDown, ChevronRight, Download, RotateCcw,
  Pause, Play, CircleDot, MessageSquare, Send, Plus
} from 'lucide-react';

export default function ExecutionDetailPage() {
  const { execId } = useParams<{ execId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const logsRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const lastSocketRefreshAtRef = useRef(0);
  const [liveLogs, setLiveLogs] = useState('');
  const [liveSteps, setLiveSteps] = useState<any[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<any[]>([]);
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [liveInterventions, setLiveInterventions] = useState<any[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentStepIndex, setCommentStepIndex] = useState<number | null>(null);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [viewerCurrentTimeMs, setViewerCurrentTimeMs] = useState(0);
  const [activeCommentDot, setActiveCommentDot] = useState<string | null>(null);
  const [tab, setTab] = useState<'logs' | 'steps' | 'artifacts' | 'code'>('logs');
  const [liveScript, setLiveScript] = useState<{ content: string; filename: string; type: string } | null>(null);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [codePatchStatus, setCodePatchStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [currentStepName, setCurrentStepName] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['execution', execId],
    queryFn: () => {
      return executionsApi.get(execId!);
    },
    refetchInterval: (q) => {
      const status = q.state.data?.data?.execution?.status;
      return status === 'queued' || status === 'running' || status === 'paused' ? 3000 : false;
    },
  });

  const addCommentRef = useRef<{ commentDraft: string; commentStepIndex: number | null; viewerCurrentTimeMs: number; steps: any[]; liveSteps: any[] }>({ commentDraft: '', commentStepIndex: null, viewerCurrentTimeMs: 0, steps: [], liveSteps: [] });

  const addComment = useMutation({
    mutationFn: () => {
      const { commentDraft: draft, commentStepIndex: stepIdx, viewerCurrentTimeMs: videoMs, steps: s, liveSteps: ls } = addCommentRef.current;
      const allSteps = mergeByStepIndex(s, ls);
      return executionsApi.addComment(execId!, {
        content: draft,
        ...(stepIdx != null ? { step_index: stepIdx } : {}),
        timestamp_ms: stepIdx != null && allSteps[stepIdx]?.timestamp_ms != null
          ? allSteps[stepIdx].timestamp_ms
          : videoMs || undefined,
      });
    },
    onSuccess: () => {
      setCommentDraft('');
      setCommentStepIndex(null);
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });

  const { data: logsData } = useQuery({
    queryKey: ['execution-logs', execId],
    queryFn: () => {
      return executionsApi.getLogs(execId!);
    },
    enabled: !!execId,
  });

  const exec = data?.data?.execution;
  const steps: any[] = data?.data?.steps || [];
  const artifacts: any[] = data?.data?.artifacts || [];
  const comments: any[] = data?.data?.comments || [];
  const interventions: any[] = data?.data?.interventions || [];
  const historicLogs: string = logsData?.data?.logs || '';

  // Keep ref in sync so addComment mutation always reads fresh values
  addCommentRef.current = { commentDraft, commentStepIndex, viewerCurrentTimeMs, steps, liveSteps };

  const cancel = useMutation({
    mutationFn: () => executionsApi.cancel(execId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['execution', execId] }); toast.info('Execução cancelada'); },
    onError: () => toast.error('Erro ao cancelar execução'),
  });

  const rerun = useMutation({
    mutationFn: () => executionsApi.create({
      test_case_id: exec?.test_case_id || undefined,
      script_id: exec?.script_id || undefined,
      browsers: exec?.browsers ? JSON.parse(exec.browsers) : ['chromium'],
      video_enabled: !!exec?.video_enabled,
      screenshot_enabled: exec?.screenshot_enabled !== 0,
      timeout: 60000,
    }),
    onSuccess: (res) => { toast.success('Re-execução criada'); navigate(`/executions/${res.data.execution.id}`); },
    onError: () => toast.error('Erro ao criar re-execução'),
  });


  useEffect(() => {
    const token = localStorage.getItem('gostate:token');
    if (!token || !execId) return;

    const socket = socketIo(API_BASE, { auth: { token } });
    socketRef.current = socket;

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

    // Live step events from agent via backend relay
    socket.on('exec:step', (payload: any) => {
      if (payload.execId !== execId) return;
      // Track current running step for code editor highlight
      if (payload.event === 'stepBegin') setCurrentStepName(payload.name || null);
      else if (payload.event === 'stepEnd') setCurrentStepName(null);
      setLiveSteps(prev => {
        const nextStep = {
          step_index: payload.stepIndex,
          name: payload.name,
          status: payload.event === 'stepBegin' ? 'running' : (payload.status || 'passed'),
          type: payload.category || 'action',
          duration_ms: payload.event === 'stepBegin' ? null : payload.duration,
          error_message: payload.event === 'stepBegin' ? null : payload.error,
          timestamp_ms: payload.timestamp,
        };
        const existingIdx = prev.findIndex(s => s.step_index === payload.stepIndex);
        if (existingIdx === -1) return [...prev, nextStep].sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));
        const clone = [...prev];
        clone[existingIdx] = { ...clone[existingIdx], ...nextStep };
        return clone.sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));
      });
    });

    // Pause/resume confirmations
    socket.on('exec:paused', (payload: any) => {
      if (payload.execId === execId) setIsPaused(true);
    });
    socket.on('exec:resumed', (payload: any) => {
      if (payload.execId === execId) setIsPaused(false);
    });

    socket.on('exec:script', (payload: any) => {
      if (payload.execId !== execId) return;
      setLiveScript({ content: payload.content || '', filename: payload.filename || '', type: payload.type || 'script' });
      setCodeDraft(null);
    });

    socket.on('exec:code_patched', (payload: any) => {
      if (payload.execId !== execId) return;
      setCodePatchStatus(payload.ok ? 'ok' : 'error');
      setTimeout(() => setCodePatchStatus('idle'), 3000);
    });

    socket.on('exec:artifact', (payload: any) => {
      if (payload.execId !== execId || !payload.artifact) return;
      setLiveArtifacts(prev => {
        const liveArtifact = {
          ...payload.artifact,
          __live: true,
          __receivedAt: Date.now(),
        };
        if (prev.some(a => a.id === liveArtifact.id || a.filename === liveArtifact.filename)) return prev;
        return [...prev, liveArtifact];
      });
    });

    socket.on('exec:comment', (payload: any) => {
      if (payload.execId !== execId || !payload.comment) return;
      setLiveComments(prev => {
        if (prev.some(c => c.id === payload.comment.id)) return prev;
        return [...prev, payload.comment];
      });
    });

    socket.on('exec:intervention', (payload: any) => {
      if (payload.execId !== execId || !payload.intervention) return;
      setLiveInterventions(prev => upsertTimelineEntity(prev, payload.intervention));
    });

    const refreshExec = (payload: any) => {
      if (payload?.id === execId || payload?.execId === execId) {
        const now = Date.now();
        if (now - lastSocketRefreshAtRef.current < 250) return;
        lastSocketRefreshAtRef.current = now;
        qc.invalidateQueries({ queryKey: ['execution', execId] });
      }
    };

    socket.on('exec:started', refreshExec);
    socket.on('exec:finished', refreshExec);
    socket.on('exec:update', refreshExec);
    socket.on('exec:cancelled', refreshExec);
    socket.on('exec:artifact', refreshExec);

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [execId, qc]);

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

  const isActive = exec.status === 'queued' || exec.status === 'running' || exec.status === 'paused';
  const isRunning = exec.status === 'running';
  const isExecPaused = exec.status === 'paused' || isPaused;

  const handlePause = () => {
    if (socketRef.current && execId) {
      socketRef.current.emit('exec:pause', { execId });
    }
  };
  const handleResume = () => {
    if (socketRef.current && execId) {
      socketRef.current.emit('exec:resume', { execId });
    }
  };

  // Merge DB steps with live steps (prefer live during execution)
  const displaySteps = mergeByStepIndex(steps, liveSteps);
  const displayArtifacts = mergeArtifacts(artifacts, liveArtifacts);
  const displayComments = mergeComments(comments, liveComments);
  const displayInterventions = mergeInterventions(interventions, liveInterventions);
  const displayStepsWithArtifacts = attachStepScreenshots(displaySteps, displayArtifacts);
  const liveViewerMedia = selectLiveViewerMedia(displayArtifacts, isActive);
  const latestScreenshot = liveViewerMedia.screenshot;
  const latestVideo = liveViewerMedia.video;
  const activeViewerAsset = liveViewerMedia.primary;

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
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
            {isExecPaused && <Pause className="w-4 h-4 text-yellow-400" />}
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {formatDate(exec.created_at)}
            {exec.duration_ms ? ` · ${formatDuration(exec.duration_ms)}` : ''}
            {exec.agent_name ? ` · Agente: ${exec.agent_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && !isExecPaused && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/10 transition-colors"
              onClick={handlePause}
              title="Pausar execução"
            >
              <Pause className="w-3 h-3" />
              Pausar
            </button>
          )}
          {isExecPaused && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
              onClick={handleResume}
              title="Continuar execução"
            >
              <Play className="w-3 h-3" />
              Continuar
            </button>
          )}
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
        const stepsTotal = displayStepsWithArtifacts.length;
        const stepsPassed = displayStepsWithArtifacts.filter((s: any) => s.status === 'passed').length;
        const stepsFailed = displayStepsWithArtifacts.filter((s: any) => s.status === 'failed').length;
        const stepsSkipped = stepsTotal - stepsPassed - stepsFailed;
        const passRate = stepsTotal > 0 ? Math.round((stepsPassed / stepsTotal) * 100) : (exec.status === 'passed' ? 100 : 0);
        const artifactVideos = displayArtifacts.filter((a: any) => a.type === 'video').length;
        const artifactScreenshots = displayArtifacts.filter((a: any) => a.type === 'screenshot').length;

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
                  {artifactVideos > 0 && <span className="text-xs font-semibold text-teal-400">{artifactVideos} vídeo{artifactVideos !== 1 ? 's' : ''}</span>}
                  {artifactScreenshots > 0 && <span className="text-xs font-semibold text-blue-400">{artifactScreenshots} screenshot{artifactScreenshots !== 1 ? 's' : ''}</span>}
                  {displayArtifacts.length === 0 && <span className="text-base font-bold text-slate-400">—</span>}
                </div>
              </div>
            </div>

            {/* Live Viewer — full width, larger */}
            <div className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Live Viewer</p>
                  <div className="flex items-center gap-3">
                    {activeViewerAsset?.kind === 'video' && (
                      <button
                        className="text-xs px-2 py-1 rounded border transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                        onClick={() => {
                          const el = liveVideoRef.current;
                          if (!el) return;
                          if (el.paused) { void el.play(); setViewerPaused(false); }
                          else { el.pause(); setViewerPaused(true); }
                        }}
                      >
                        {viewerPaused ? 'Play' : 'Pausar viewer'}
                      </button>
                    )}
                    {isActive && <span className="text-xs text-blue-400 flex items-center gap-1"><CircleDot className="w-3 h-3" /> Ao vivo</span>}
                  </div>
                </div>

                {/* Main media area */}
                <div className="rounded-lg overflow-hidden border relative" style={{ borderColor: 'var(--border)', background: '#070c14', minHeight: '360px' }}>
                  {activeViewerAsset?.kind === 'screenshot' && latestScreenshot ? (
                    <img
                      src={latestScreenshot.url?.startsWith('http') ? latestScreenshot.url : `${API_BASE}${latestScreenshot.url}`}
                      alt={latestScreenshot.filename}
                      className="w-full h-[480px] object-contain"
                    />
                  ) : activeViewerAsset?.kind === 'video' && latestVideo ? (
                    <video
                      ref={liveVideoRef}
                      src={latestVideo.url?.startsWith('http') ? latestVideo.url : `${API_BASE}${latestVideo.url}`}
                      controls
                      className="w-full h-[480px] object-contain bg-black"
                      onPlay={() => setViewerPaused(false)}
                      onPause={() => setViewerPaused(true)}
                      onTimeUpdate={(e) => setViewerCurrentTimeMs(Math.round(e.currentTarget.currentTime * 1000))}
                    />
                  ) : (
                    <div className="h-[480px] flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                      <Image className="w-10 h-10 text-slate-700" />
                      {isActive ? 'Aguardando screenshot ao vivo...' : 'Nenhum artefato disponível'}
                    </div>
                  )}
                </div>

                {/* Timeline bar with comment dots */}
                {displayComments.filter((c: any) => c.timestamp_ms != null).length > 0 && (
                  <div className="relative mt-3" style={{ height: '20px' }}>
                    <div className="absolute inset-0 rounded-full" style={{ background: 'var(--surface-2)' }} />
                    {(() => {
                      const videoDurationMs = liveVideoRef.current ? liveVideoRef.current.duration * 1000 : 0;
                      const maxMs = videoDurationMs > 0 ? videoDurationMs : Math.max(...displayComments.map((c: any) => c.timestamp_ms || 0), 1);
                      return displayComments
                        .filter((c: any) => c.timestamp_ms != null)
                        .map((comment: any) => {
                          const pct = Math.min(100, Math.max(0, (comment.timestamp_ms / maxMs) * 100));
                          const isOpen = activeCommentDot === comment.id;
                          return (
                            <div key={comment.id} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
                              <button
                                className="w-3.5 h-3.5 rounded-full border-2 border-teal-400 bg-teal-500 hover:scale-125 transition-transform z-10 relative"
                                title={comment.content}
                                onClick={() => setActiveCommentDot(isOpen ? null : comment.id)}
                              />
                              {isOpen && (
                                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-52 rounded-lg border p-2 shadow-xl text-xs"
                                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                                  <div className="text-teal-400 font-mono mb-1">{formatTimeMs(comment.timestamp_ms)}</div>
                                  <p className="whitespace-pre-wrap">{comment.content}</p>
                                  <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{comment.user_name || 'Usuário'}</div>
                                </div>
                              )}
                            </div>
                          );
                        }); // end map
                    })()}
                  </div>
                )}

                {/* Comment input */}
                <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Comentários ({displayComments.length})</p>
                    {viewerCurrentTimeMs > 0 && (
                      <span className="text-[11px] text-teal-400">@ {formatTimeMs(viewerCurrentTimeMs)}</span>
                    )}
                  </div>
                  <textarea
                    className="input min-h-[72px] text-sm w-full"
                    placeholder={`Comentar${viewerCurrentTimeMs > 0 ? ` em ${formatTimeMs(viewerCurrentTimeMs)}` : ' esta execução'}...`}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && commentDraft.trim()) addComment.mutate(); }}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 flex-wrap">
                      {displayComments.filter((c: any) => c.timestamp_ms != null).slice(-5).map((c: any) => (
                        <span key={c.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 cursor-pointer"
                          title={c.content} onClick={() => setActiveCommentDot(activeCommentDot === c.id ? null : c.id)}>
                          {formatTimeMs(c.timestamp_ms)}
                        </span>
                      ))}
                    </div>
                    <button
                      className="btn-primary flex items-center gap-2 text-sm py-1.5 px-3"
                      disabled={!commentDraft.trim() || addComment.isPending}
                      onClick={() => addComment.mutate()}
                    >
                      {addComment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Comentar
                    </button>
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
                  <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">🎥 Vídeo ativado</span>
                </div>
              )}
              {exec.screenshot_enabled !== 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">📸 Screenshot ativado</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {([
          { key: 'logs', label: `Logs${liveLogs ? ' 🔴' : ''}` },
          { key: 'steps', label: `Steps (${displayStepsWithArtifacts.length})${isActive && liveSteps.length > 0 ? ' 🔴' : ''}` },
          { key: 'artifacts', label: `Artefatos (${displayArtifacts.length})` },
          { key: 'code', label: liveScript ? `Código` : `Código` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key
              ? 'text-blue-400 border-blue-500'
              : 'border-transparent hover:text-blue-400'
            }`}
            style={tab !== key ? { color: 'var(--text-muted)' } : undefined}
          >
            {label}
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
          {displayStepsWithArtifacts.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 text-sm">
              {isActive ? 'Aguardando steps...' : 'Nenhum step registrado'}
            </div>
          ) : (() => {
            const totalDur = displayStepsWithArtifacts.reduce((acc: number, s: any) => acc + (s.duration_ms || 0), 0);
            return displayStepsWithArtifacts.map((step: any, idx: number) => (
              <StepRow key={step.id || step.step_index || idx} step={step} index={idx} totalDuration={totalDur} />
            ));
          })()}
        </div>
      )}

      {/* Tab: Artifacts */}
      {tab === 'artifacts' && (
        <ArtifactsTab artifacts={displayArtifacts} />
      )}

      {/* Tab: Code Editor */}
      {tab === 'code' && (
        <CodeEditorTab
          execId={execId!}
          script={liveScript}
          codeDraft={codeDraft}
          setCodeDraft={setCodeDraft}
          patchStatus={codePatchStatus}
          currentStepName={currentStepName}
          isActive={isActive}
          isExecPaused={isExecPaused}
          socketRef={socketRef}
          onPatchSent={() => setCodePatchStatus('sending')}
        />
      )}
    </div>
  );
}

function mergeByStepIndex(baseSteps: any[], liveSteps: any[]) {
  const merged = new Map<number, any>();
  for (const step of baseSteps || []) merged.set(step.step_index ?? merged.size, step);
  for (const step of liveSteps || []) merged.set(step.step_index ?? merged.size, { ...merged.get(step.step_index ?? merged.size), ...step });
  return Array.from(merged.values()).sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0));
}

function mergeArtifacts(baseArtifacts: any[], liveArtifacts: any[]) {
  const merged = new Map<string, any>();
  for (const artifact of baseArtifacts || []) merged.set(artifact.id || artifact.filename, artifact);
  for (const artifact of liveArtifacts || []) merged.set(artifact.id || artifact.filename, artifact);
  return Array.from(merged.values()).sort(sortArtifactsNewestFirst);
}

function mergeComments(baseComments: any[], liveComments: any[]) {
  const merged = new Map<string, any>();
  for (const comment of baseComments || []) merged.set(comment.id, comment);
  for (const comment of liveComments || []) merged.set(comment.id, comment);
  return Array.from(merged.values()).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function mergeInterventions(baseInterventions: any[], liveInterventions: any[]) {
  const merged = new Map<string, any>();
  for (const intervention of baseInterventions || []) merged.set(intervention.id, intervention);
  for (const intervention of liveInterventions || []) merged.set(intervention.id, intervention);
  return Array.from(merged.values()).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function upsertTimelineEntity(items: any[], nextItem: any) {
  const existingIdx = items.findIndex((item: any) => item.id === nextItem.id);
  if (existingIdx === -1) return [...items, nextItem];
  const clone = [...items];
  clone[existingIdx] = { ...clone[existingIdx], ...nextItem };
  return clone;
}

function attachStepScreenshots(steps: any[], artifacts: any[]) {
  const screenshotByIndex = new Map<number, any>();
  for (const artifact of artifacts || []) {
    if (artifact.type !== 'screenshot' || !artifact.filename) continue;
    const match = artifact.filename.match(/step[-_](\d+)/i);
    if (!match) continue;
    screenshotByIndex.set(Number(match[1]), artifact);
  }

  return (steps || []).map((step: any) => {
    const screenshot = screenshotByIndex.get(step.step_index);
    if (!screenshot || step.screenshot_url) return step;
    return {
      ...step,
      screenshot_url: screenshot.url,
    };
  });
}

function sortArtifactsNewestFirst(a: any, b: any) {
  const aTime = artifactTimestamp(a);
  const bTime = artifactTimestamp(b);
  return bTime - aTime;
}

function selectLiveViewerMedia(artifacts: any[], isActive: boolean) {
  const screenshots = (artifacts || []).filter((a: any) => a.type === 'screenshot').sort(sortArtifactsNewestFirst);
  const videos = (artifacts || []).filter((a: any) => a.type === 'video').sort(sortArtifactsNewestFirst);
  const liveScreenshot = screenshots.find((a: any) => isLiveSocketArtifact(a));
  const liveVideo = videos.find((a: any) => isLiveSocketArtifact(a));
  const screenshot = isActive ? (liveScreenshot || screenshots[0] || null) : (screenshots[0] || null);
  const video = isActive ? (liveVideo || videos[0] || null) : (videos[0] || null);
  const primary = isActive
    ? (liveScreenshot ? { kind: 'screenshot', asset: liveScreenshot } : liveVideo ? { kind: 'video', asset: liveVideo } : screenshot ? { kind: 'screenshot', asset: screenshot } : video ? { kind: 'video', asset: video } : null)
    : (video ? { kind: 'video', asset: video } : screenshot ? { kind: 'screenshot', asset: screenshot } : null);
  return { screenshot, video, primary };
}

function isLiveSocketArtifact(artifact: any) {
  return Boolean(artifact && (artifact.__live || artifact.id == null));
}

function artifactTimestamp(artifact: any) {
  if (!artifact) return 0;
  if (typeof artifact.timestamp_ms === 'number') return artifact.timestamp_ms;
  if (typeof artifact.__receivedAt === 'number') return artifact.__receivedAt;
  return new Date(artifact.created_at || 0).getTime();
}

function formatTimeMs(value: number) {
  const totalSeconds = Math.max(0, Math.floor((value || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function interventionStatusClass(status: string) {
  switch (status) {
    case 'approved': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'applied': return 'bg-green-500/10 text-green-400 border border-green-500/20';
    case 'rejected':
    case 'cancelled': return 'bg-red-500/10 text-red-400 border border-red-500/20';
    default: return 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20';
  }
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

const CODE_SNIPPETS = [
  { label: 'Screenshot', icon: '📸', code: "  await page.screenshot({ path: 'test-results/manual-screenshot.png' });\n" },
  { label: 'Aguardar (1s)', icon: '⏱', code: "  await page.waitForTimeout(1000);\n" },
  { label: 'Aguardar (3s)', icon: '⏱', code: "  await page.waitForTimeout(3000);\n" },
  { label: 'Aguardar elemento', icon: '👁', code: "  await page.waitForSelector('SELECTOR', { state: 'visible' });\n" },
  { label: 'Aguardar URL', icon: '🔗', code: "  await page.waitForURL('**/URL_PATTERN**');\n" },
  { label: 'Click', icon: '🖱', code: "  await page.click('SELECTOR');\n" },
  { label: 'Fill', icon: '✏️', code: "  await page.fill('SELECTOR', 'TEXTO');\n" },
  { label: 'Press key', icon: '⌨', code: "  await page.keyboard.press('Enter');\n" },
  { label: 'Scroll to', icon: '📜', code: "  await page.locator('SELECTOR').scrollIntoViewIfNeeded();\n" },
  { label: 'Expect visible', icon: '✅', code: "  await expect(page.locator('SELECTOR')).toBeVisible();\n" },
  { label: 'Expect text', icon: '🔍', code: "  await expect(page.locator('SELECTOR')).toContainText('TEXTO');\n" },
  { label: 'Select option', icon: '📋', code: "  await page.selectOption('SELECTOR', 'VALOR');\n" },
  { label: 'Hover', icon: '🎯', code: "  await page.hover('SELECTOR');\n" },
  { label: 'Goto URL', icon: '🌐', code: "  await page.goto('https://URL');\n" },
];

function findCurrentLineIndex(code: string, stepName: string | null): number {
  if (!stepName) return -1;
  const lines = code.split('\n');
  // Try to match the step name in different ways:
  // e.g. stepName = "page.click('button')" → look for ".click(" in code
  const stepLower = stepName.toLowerCase();
  // Extract the method part: "page.click" → "click", "locator.fill" → "fill"
  const methodMatch = stepLower.match(/^(?:page|locator|expect|frame)\.([\w]+)/);
  const method = methodMatch ? methodMatch[1] : null;
  // Also look for the full step string
  const firstArg = stepName.match(/\('([^']+)'/)?.[1] || stepName.match(/\("([^"]+)"/)?.[1];

  let bestMatch = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (!line.trim() || line.trim().startsWith('//')) continue;
    // Match by method name + first arg if available
    if (method && line.includes(`.${method}(`)) {
      if (firstArg && line.includes(firstArg.toLowerCase())) {
        return i; // exact match with arg
      }
      if (bestMatch === -1) bestMatch = i; // method-only match as fallback
    }
  }
  return bestMatch;
}

function CodeEditorTab({
  execId, script, codeDraft, setCodeDraft, patchStatus, currentStepName,
  isActive, isExecPaused, socketRef, onPatchSent,
}: {
  execId: string;
  script: { content: string; filename: string; type: string } | null;
  codeDraft: string | null;
  setCodeDraft: (v: string | null) => void;
  patchStatus: 'idle' | 'sending' | 'ok' | 'error';
  currentStepName: string | null;
  isActive: boolean;
  isExecPaused: boolean;
  socketRef: React.MutableRefObject<any>;
  onPatchSent: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readonlyRef = useRef<HTMLDivElement>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);
  const [insertAfterLine, setInsertAfterLine] = useState<number | null>(null);

  const content = script?.content || '';
  const editableContent = codeDraft !== null ? codeDraft : content;
  const isTestCase = script?.type === 'test_case';
  const currentLineIdx = findCurrentLineIndex(editableContent, currentStepName);

  // Auto-scroll read-only view to current line when step changes
  useEffect(() => {
    if (currentLineIdx >= 0 && readonlyRef.current && codeDraft === null) {
      const lineEls = readonlyRef.current.querySelectorAll('[data-line]');
      const el = lineEls[currentLineIdx] as HTMLElement | undefined;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentLineIdx, codeDraft]);

  const insertSnippet = (snippetCode: string) => {
    const target = codeDraft ?? content;
    const lines = target.split('\n');
    const insertAt = insertAfterLine !== null ? insertAfterLine : (cursorLine !== null ? cursorLine : lines.length - 2);
    const before = lines.slice(0, insertAt + 1).join('\n');
    const after = lines.slice(insertAt + 1).join('\n');
    const newContent = before + '\n' + snippetCode + after;
    setCodeDraft(newContent);
    setShowSnippets(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + 1 + snippetCode.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 50);
  };

  const sendPatch = () => {
    if (!socketRef.current || codeDraft === null) return;
    socketRef.current.emit('exec:code_patch', { execId, content: codeDraft });
    onPatchSent();
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendPatch();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      setCodeDraft(newVal);
      setTimeout(() => ta.setSelectionRange(start + 2, start + 2), 0);
    }
  };

  if (!script) {
    return (
      <div className="card p-12 text-center">
        <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-400 font-medium text-sm">Nenhum script disponível</p>
        <p className="text-xs text-slate-600 mt-1">
          {isActive ? 'Aguardando conexão com o agente...' : 'Script não disponível para esta execução'}
        </p>
      </div>
    );
  }

  if (isTestCase) {
    return (
      <div className="card p-6 text-center">
        <Terminal className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Este teste usa steps configurados no editor visual.</p>
        <p className="text-xs text-slate-500 mt-1">Edição em tempo real disponível apenas para scripts JavaScript.</p>
      </div>
    );
  }

  const isDirty = codeDraft !== null && codeDraft !== content;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{script.filename || 'test.spec.js'}</span>
          {currentStepName && isActive && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/25 animate-pulse flex-shrink-0 max-w-[220px] truncate" title={currentStepName}>
              ▶ {currentStepName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Insert snippet button */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
              onClick={() => { setInsertAfterLine(cursorLine); setShowSnippets(v => !v); }}
              title="Inserir snippet de código"
            >
              <Plus className="w-3 h-3" /> Inserir
            </button>
            {showSnippets && (
              <div
                className="absolute right-0 top-full mt-1 z-30 rounded-xl border shadow-2xl py-1 w-52"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider px-3 py-1.5" style={{ color: 'var(--text-muted)' }}>
                  Inserir após linha {(insertAfterLine ?? 0) + 1}
                </p>
                {CODE_SNIPPETS.map(s => (
                  <button
                    key={s.label}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text)' }}
                    onClick={() => insertSnippet(s.code)}
                  >
                    <span className="text-sm w-5 flex-shrink-0">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isDirty && (
            <>
              <button
                className="text-xs px-2 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                onClick={() => { setCodeDraft(null); setShowSnippets(false); }}
              >
                Descartar
              </button>
              <button
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  patchStatus === 'sending' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                  patchStatus === 'ok' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                  patchStatus === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                  'bg-blue-600 text-white hover:bg-blue-700 border border-blue-500'
                }`}
                disabled={patchStatus === 'sending'}
                onClick={sendPatch}
                title="Ctrl+Enter para aplicar"
              >
                {patchStatus === 'sending' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                 patchStatus === 'ok' ? <CheckCircle2 className="w-3 h-3" /> :
                 patchStatus === 'error' ? <XCircle className="w-3 h-3" /> :
                 <Send className="w-3 h-3" />}
                {patchStatus === 'sending' ? 'Enviando...' : patchStatus === 'ok' ? 'Aplicado!' : patchStatus === 'error' ? 'Erro' : 'Aplicar'}
              </button>
            </>
          )}
          {!isDirty && codeDraft === null && (
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
              onClick={() => setCodeDraft(content)}
            >
              ✏️ Editar
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      {isActive && !isExecPaused && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.15)' }}>
          <CircleDot className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-200/70">Pause a execução antes de aplicar patches. A linha em amarelo indica onde a execução está agora.</p>
        </div>
      )}

      {/* Code view */}
      <div
        className="rounded-lg overflow-hidden border relative"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => setShowSnippets(false)}
      >
        {/* Read-only highlighted view */}
        {codeDraft === null && (
          <div
            ref={readonlyRef}
            className="font-mono text-xs overflow-auto select-text"
            style={{ background: '#0a0f1a', height: '520px' }}
          >
            {editableContent.split('\n').map((line, idx) => {
              const isRunning = idx === currentLineIdx;
              return (
                <div
                  key={idx}
                  data-line={idx}
                  className={`flex items-start group px-0 ${isRunning ? 'bg-yellow-500/15' : 'hover:bg-white/[0.025]'}`}
                  style={isRunning ? { borderLeft: '2px solid #eab308' } : { borderLeft: '2px solid transparent' }}
                >
                  <span className="select-none text-right w-9 flex-shrink-0 px-1 py-0 leading-6 text-slate-600 text-[11px]">{idx + 1}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-4 h-6 flex items-center justify-center text-slate-600 hover:text-teal-400 transition-all"
                    title={`Inserir após linha ${idx + 1}`}
                    onClick={e => { e.stopPropagation(); setInsertAfterLine(idx); setShowSnippets(true); }}
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <span className={`flex-1 py-0 leading-6 whitespace-pre pr-4 ${isRunning ? 'text-yellow-200' : 'text-green-300'}`}>{line || ' '}</span>
                  {isRunning && (
                    <span className="flex-shrink-0 text-[10px] text-yellow-400/70 pr-2 leading-6 animate-pulse">◀ executando</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Editable textarea */}
        {codeDraft !== null && (
          <div className="relative" style={{ background: '#0a0f1a', height: '520px' }}>
            {/* Line numbers overlay */}
            <div
              className="absolute top-0 left-0 bottom-0 w-9 overflow-hidden pointer-events-none select-none"
              style={{ background: '#0a0f1a', borderRight: '1px solid rgba(255,255,255,0.05)' }}
              aria-hidden
            >
              {codeDraft.split('\n').map((_, idx) => (
                <div key={idx} className="text-right pr-1 leading-6 text-[11px] text-slate-600">{idx + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="absolute inset-0 w-full h-full font-mono text-xs resize-none outline-none bg-transparent"
              style={{ paddingLeft: '2.6rem', paddingRight: '0.5rem', lineHeight: '1.5rem', color: '#86efac', caretColor: 'white' }}
              value={codeDraft}
              onChange={e => setCodeDraft(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onSelect={e => {
                const ta = e.currentTarget;
                const val = ta.value;
                const pos = ta.selectionStart;
                const linesBefore = val.substring(0, pos).split('\n');
                setCursorLine(linesBefore.length - 1);
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        )}
      </div>

      {isDirty && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Ctrl+Enter</kbd> para aplicar patch · <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Tab</kbd> para indentar
        </p>
      )}
    </div>
  );
}

function ArtifactsTab({ artifacts }: { artifacts: any[] }) {
  const [showReports, setShowReports] = useState(false);
  const mediaArtifacts = artifacts.filter((a: any) => a.type === 'video' || a.type === 'screenshot');
  const reportArtifacts = artifacts.filter((a: any) => a.type !== 'video' && a.type !== 'screenshot');

  if (artifacts.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Image className="w-10 h-10 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-400 font-medium text-sm">Nenhum artefato disponível</p>
        <p className="text-xs text-slate-600 mt-1">Screenshots e vídeos aparecerão aqui após a execução</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Videos */}
      {mediaArtifacts.filter((a: any) => a.type === 'video').map((art: any) => (
        <ArtifactRow key={art.id || art.filename} artifact={art} />
      ))}
      {/* Screenshots grid */}
      {mediaArtifacts.filter((a: any) => a.type === 'screenshot').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Screenshots ({mediaArtifacts.filter((a: any) => a.type === 'screenshot').length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {mediaArtifacts.filter((a: any) => a.type === 'screenshot').map((art: any) => (
              <ScreenshotThumb key={art.id || art.filename} artifact={art} />
            ))}
          </div>
        </div>
      )}
      {/* Reports: collapsible */}
      {reportArtifacts.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
            onClick={() => setShowReports(v => !v)}
          >
            {showReports ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Relatórios e logs técnicos ({reportArtifacts.length})
          </button>
          {showReports && (
            <div className="space-y-1.5 mt-1.5">
              {reportArtifacts.map((art: any) => (
                <ArtifactRow key={art.id || art.filename} artifact={art} />
              ))}
            </div>
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
        {isVideo && <FileVideo className="w-4 h-4 text-teal-400 flex-shrink-0" />}
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
