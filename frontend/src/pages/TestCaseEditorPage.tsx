import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testcasesApi, executionsApi } from '../lib/api';
import { formatDate, formatDuration } from '../lib/utils';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  NodeProps,
  Connection,
  Edge,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft, Plus, Trash2, Play, Save, GripVertical, Loader2,
  Globe, MousePointer, Type, Eye, Camera, Clock, Code, CheckSquare,
  AlertCircle, ChevronDown, ChevronUp, X, History, Tag,
  CheckCircle2, XCircle, ExternalLink, Zap, Database, Terminal, GitBranch, Layers
} from 'lucide-react';

/* ── Custom React Flow Node Components ────────────────────────────── */

// 1. Web Flow / Smart Web Flow Node
function WebFlowNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[200px] border-cyan-500/30 hover:border-cyan-500/60 transition-all">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-cyan-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400">
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Fluxo Web</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">WEB-FLOW</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        {data.url ? data.url : 'Sem URL definida'}
      </div>
      {data.steps && data.steps.length > 0 && (
        <div className="text-[10px] text-cyan-400 mt-1">
          {data.steps.length} passo(s) interno(s)
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-cyan-500 !w-2 !h-2" />
    </div>
  );
}

// 2. Conditional IF Node
function IfConditionNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[220px] border-amber-500/30 hover:border-amber-500/60 transition-all relative">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-amber-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
          <GitBranch className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Se</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">IF</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        Elemento: <span className="font-mono text-amber-400">{data.selector || 'body'}</span>
      </div>

      {/* Outgoing True socket */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        isConnectable={isConnectable}
        className="!bg-success !w-2 !h-2"
        style={{ left: '30%' }}
      />
      <span className="absolute bottom-[-16px] left-[20%] text-[10px] text-success font-medium">true</span>

      {/* Outgoing False socket */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        isConnectable={isConnectable}
        className="!bg-error !w-2 !h-2"
        style={{ left: '70%' }}
      />
      <span className="absolute bottom-[-16px] left-[65%] text-[10px] text-error font-medium">false</span>
    </div>
  );
}

// 3. PostgreSQL Query Node
function PostgresQueryNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[200px] border-emerald-500/30 hover:border-emerald-500/60 transition-all">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-emerald-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
          <Database className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Postgres</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">POSTGRES-QUERY</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        {data.query ? data.query : 'SELECT 1;'}
      </div>
      <div className="text-[10px] text-emerald-400 mt-1 font-mono">
        Var: {data.variableName || 'dbResult'}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-emerald-500 !w-2 !h-2" />
    </div>
  );
}

// 4. HTTP Request Node
function HttpCallNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[200px] border-purple-500/30 hover:border-purple-500/60 transition-all">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-purple-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Requisição HTTP</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">HTTP-REQUEST</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        <span className="font-semibold text-purple-400 mr-1">{data.method || 'GET'}</span> {data.url || 'URL da API'}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-purple-500 !w-2 !h-2" />
    </div>
  );
}

// 5. Logger Node
function LogNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[200px] border-blue-500/30 hover:border-blue-500/60 transition-all">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-blue-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Log</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">LOG</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        {data.message ? data.message : 'Sem mensagem definida'}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  );
}

// 6. Stop and Fail Node
function StopAndFailNode({ data, isConnectable }: NodeProps) {
  return (
    <div className="card px-3.5 py-3.5 rounded-xl border bg-surface-1 shadow-card min-w-[200px] border-red-500/30 hover:border-red-500/60 transition-all">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-red-500 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400">
          <XCircle className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-text block">Parar e Falhar</span>
          <span className="text-[10px] text-text-muted uppercase tracking-wider font-mono">STOP-AND-FAIL</span>
        </div>
      </div>
      <div className="text-xs text-text-muted mt-2 border-t pt-1.5 border-border truncate">
        {data.message ? data.message : 'Fluxo interrompido'}
      </div>
    </div>
  );
}

const customNodeTypes = {
  webFlow: WebFlowNode,
  ifCondition: IfConditionNode,
  postgresQuery: PostgresQueryNode,
  httpCall: HttpCallNode,
  logNode: LogNode,
  stopAndFail: StopAndFailNode,
};

/* ── Step catalog (for traditional list and webFlow nested steps) ──── */
const STEP_CATALOG = [
  {
    group: 'Navegação',
    items: [
      { type: 'goto', label: 'Abrir URL', icon: Globe, color: 'blue',
        fields: [{ key: 'url', label: 'URL', placeholder: 'https://exemplo.com', type: 'text' }],
        summary: (p: any) => p.url || 'URL não definida' },
    ],
  },
  {
    group: 'Interação',
    items: [
      { type: 'click', label: 'Clique', icon: MousePointer, color: 'cyan',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'button, #id, .classe', type: 'text' }],
        summary: (p: any) => p.selector || 'seletor não definido' },
      { type: 'fill', label: 'Preencher Campo', icon: Type, color: 'cyan',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' },
          { key: 'value', label: 'Valor', placeholder: 'texto a preencher', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'wait_ms', label: 'Aguardar', icon: Clock, color: 'amber',
        fields: [{ key: 'ms', label: 'Milissegundos', placeholder: '1000', type: 'number' }],
        summary: (p: any) => `${p.ms || 1000}ms` },
      { type: 'hover', label: 'Hover', icon: MousePointer, color: 'cyan',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.menu-item', type: 'text' }],
        summary: (p: any) => `hover em ${p.selector || '?'}` },
      { type: 'double_click', label: 'Duplo Clique', icon: MousePointer, color: 'cyan',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.item', type: 'text' }],
        summary: (p: any) => `duplo clique em ${p.selector || '?'}` },
      { type: 'select_option', label: 'Selecionar Opção', icon: CheckSquare, color: 'cyan',
        fields: [
          { key: 'selector', label: 'Seletor do select', placeholder: 'select#estado', type: 'text' },
          { key: 'value', label: 'Valor', placeholder: 'SP', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'clear', label: 'Limpar Campo', icon: Type, color: 'cyan',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' }],
        summary: (p: any) => `limpar ${p.selector || '?'}` },
      { type: 'keyboard', label: 'Tecla do Teclado', icon: Code, color: 'amber',
        fields: [
          { key: 'key', label: 'Tecla', placeholder: 'Enter, Tab, Escape, ArrowDown', type: 'text' },
        ],
        summary: (p: any) => `tecla ${p.key || '?'}` },
      { type: 'scroll', label: 'Rolar Página', icon: Globe, color: 'blue',
        fields: [
          { key: 'selector', label: 'Seletor (opcional)', placeholder: 'body, .container', type: 'text' },
          { key: 'direction', label: 'Direção', placeholder: 'down', type: 'select', options: ['down','up','bottom','top'] },
        ],
        summary: (p: any) => `scroll ${p.direction || 'down'} em ${p.selector || 'página'}` },
    ],
  },
  {
    group: 'Verificações',
    items: [
      { type: 'expect_visible', label: 'Verificar Visível', icon: Eye, color: 'green',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: 'h1, .titulo', type: 'text' }],
        summary: (p: any) => `${p.selector || '?'} visível` },
      { type: 'expect_hidden', label: 'Verificar Oculto', icon: Eye, color: 'yellow',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.loading-spinner', type: 'text' }],
        summary: (p: any) => `${p.selector || '?'} oculto` },
      { type: 'expect_text', label: 'Verificar Texto', icon: CheckSquare, color: 'emerald',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'h1', type: 'text' },
          { key: 'text', label: 'Texto esperado', placeholder: 'Bem-vindo', type: 'text' },
        ],
        summary: (p: any) => `${p.selector || '?'} contém "${p.text || ''}"` },
      { type: 'expect_value', label: 'Verificar Valor', icon: CheckSquare, color: 'emerald',
        fields: [
          { key: 'selector', label: 'Seletor', placeholder: 'input[name="email"]', type: 'text' },
          { key: 'value', label: 'Valor esperado', placeholder: 'usuario@email.com', type: 'text' },
        ],
        summary: (p: any) => `valor de ${p.selector || '?'} = "${p.value || ''}"` },
      { type: 'assert_url', label: 'Verificar URL', icon: Globe, color: 'blue',
        fields: [{ key: 'url', label: 'URL esperada (contém)', placeholder: '/dashboard', type: 'text' }],
        summary: (p: any) => `URL contém "${p.url || '?'}"` },
      { type: 'assert_title', label: 'Verificar Título da Página', icon: Globe, color: 'blue',
        fields: [{ key: 'title', label: 'Título esperado (contém)', placeholder: 'Minha App', type: 'text' }],
        summary: (p: any) => `título contém "${p.title || '?'}"` },
      { type: 'wait_for', label: 'Aguardar Elemento', icon: AlertCircle, color: 'yellow',
        fields: [{ key: 'selector', label: 'Seletor', placeholder: '.loading-done', type: 'text' }],
        summary: (p: any) => `aguarda ${p.selector || '?'}` },
      { type: 'wait_for_url', label: 'Aguardar URL', icon: Clock, color: 'amber',
        fields: [{ key: 'url', label: 'URL esperada (contém)', placeholder: '/success', type: 'text' }],
        summary: (p: any) => `aguarda URL "${p.url || '?'}"` },
    ],
  },
  {
    group: 'Mídia & API',
    items: [
      { type: 'screenshot', label: 'Capturar Tela', icon: Camera, color: 'pink',
        fields: [{ key: 'filename', label: 'Nome do arquivo', placeholder: 'captura.png', type: 'text' }],
        summary: (p: any) => p.filename || 'screenshot.png' },
      { type: 'api_call', label: 'Chamada API', icon: Code, color: 'orange',
        fields: [
          { key: 'method', label: 'Método', placeholder: 'GET', type: 'select', options: ['GET','POST','PUT','DELETE','PATCH'] },
          { key: 'url', label: 'URL', placeholder: 'https://api.exemplo.com/v1/recurso', type: 'text' },
          { key: 'body', label: 'Body JSON (opcional)', placeholder: '{"key":"value"}', type: 'text' },
        ],
        summary: (p: any) => `${p.method || 'GET'} ${p.url || '?'}` },
    ],
  },
];

const ALL_STEP_TYPES = STEP_CATALOG.flatMap(g => g.items);
function getStepMeta(type: string) {
  return ALL_STEP_TYPES.find(s => s.type === type) || null;
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  green: 'bg-green-500/10 border-green-500/30 text-green-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  pink: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
  orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
};

export default function TestCaseEditorPage() {
  const { suiteId, tcId } = useParams<{ suiteId: string; tcId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'canvas' | 'list' | 'runs'>('canvas');

  // Load Test Case from API
  const { data, isLoading } = useQuery({
    queryKey: ['tc', suiteId, tcId],
    queryFn: () => testcasesApi.get(suiteId!, tcId!),
  });
  const tc = data?.data?.test_case;

  // State for Traditional List Editor
  const [steps, setSteps] = useState<any[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // State for Canvas Node Graph
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Dialog and execution settings
  const [showRunModal, setShowRunModal] = useState(false);
  const [runVideo, setRunVideo] = useState(false);
  const [runScreenshot, setRunScreenshot] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagsInitialized, setTagsInitialized] = useState(false);

  // Initialize data on load
  useEffect(() => {
    if (tc && !initialized) {
      let parsed: any = [];
      try {
        parsed = typeof tc.steps === 'string' ? JSON.parse(tc.steps || '[]') : (tc.steps || []);
      } catch {
        parsed = [];
      }

      if (parsed && !Array.isArray(parsed) && parsed.editorMode === 'canvas') {
        setNodes(parsed.nodes || []);
        setEdges(parsed.edges || []);
        setActiveTab('canvas');
        // Synthesize steps array for the list mode
        setSteps(compileCanvasToSteps(parsed.nodes, parsed.edges));
      } else {
        const stepArr = Array.isArray(parsed) ? parsed : [];
        setSteps(stepArr.map((s: any, i: number) => ({ ...s, _id: i })));
        // Initialize default canvas layout for list steps
        const canvas = compileStepsToCanvas(stepArr);
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setActiveTab('list');
      }
      setInitialized(true);
    }
  }, [tc, initialized, setNodes, setEdges]);

  if (tc && !tagsInitialized) {
    const parsedTags = typeof tc.tags === 'string' ? JSON.parse(tc.tags || '[]') : (tc.tags || []);
    setTags(parsedTags);
    setTagsInitialized(true);
  }

  // Load Runs history
  const { data: execHistoryData } = useQuery({
    queryKey: ['tc-exec-history', tcId],
    queryFn: () => executionsApi.list({ test_case_id: tcId, limit: 20 }),
    enabled: activeTab === 'runs',
  });
  const execHistory: any[] = execHistoryData?.data?.executions || [];

  const flakiness = (() => {
    if (execHistory.length < 5) return null;
    const last10 = execHistory.slice(0, 10);
    let switches = 0;
    for (let i = 1; i < last10.length; i++) {
      const prev = last10[i - 1].status;
      const curr = last10[i].status;
      if ((prev === 'passed') !== (curr === 'passed')) switches++;
    }
    return switches / (last10.length - 1);
  })();

  // Node to Step compile helpers
  function compileCanvasToSteps(graphNodes: any[], graphEdges: any[]): any[] {
    const stepsList: any[] = [];
    const visited = new Set<string>();

    const compileNode = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = graphNodes.find(n => n.id === nodeId);
      if (!node) return;

      if (node.type === 'webFlow') {
        if (node.data?.url) {
          stepsList.push({ type: 'goto', params: { url: node.data.url } });
        }
        if (Array.isArray(node.data?.steps)) {
          stepsList.push(...node.data.steps);
        }
      } else if (node.type === 'postgresQuery') {
        stepsList.push({
          type: 'api_call',
          params: { method: 'POST', url: '/api/query/postgres', body: JSON.stringify({ query: node.data.query, variable: node.data.variableName }) }
        });
      } else if (node.type === 'httpCall') {
        stepsList.push({
          type: 'api_call',
          params: { method: node.data.method || 'GET', url: node.data.url, body: node.data.body }
        });
      } else if (node.type === 'logNode') {
        stepsList.push({ type: 'wait_ms', params: { ms: '100', message: node.data.message } });
      } else if (node.type === 'stopAndFail') {
        stepsList.push({ type: 'expect_hidden', params: { selector: 'body', message: node.data.message } });
      }

      // Check outgoing non-branching edges
      const edge = graphEdges.find(e => e.source === nodeId);
      if (edge) compileNode(edge.target);
    };

    // Find start nodes
    const incomingTargetIds = new Set(graphEdges.map(e => e.target));
    const roots = graphNodes.filter(n => !incomingTargetIds.has(n.id));
    const startNode = roots.find(n => n.type === 'webFlow') || roots[0] || graphNodes[0];

    if (startNode) compileNode(startNode.id);
    return stepsList.map((s, idx) => ({ ...s, _id: idx }));
  }

  function compileStepsToCanvas(stepList: any[]): { nodes: any[]; edges: any[] } {
    const canvasNodes: any[] = [];
    const canvasEdges: any[] = [];
    let prevId = '';

    // Create a default Web Flow node holding all steps
    const id = 'wf-start';
    canvasNodes.push({
      id,
      type: 'webFlow',
      position: { x: 250, y: 100 },
      data: {
        label: 'Fluxo Web Principal',
        url: stepList.find(s => s.type === 'goto')?.params?.url || 'https://www.demoblaze.com',
        steps: stepList.filter(s => s.type !== 'goto'),
      }
    });

    return { nodes: canvasNodes, edges: canvasEdges };
  }

  // Handle Drag-and-Drop Node Addition to Canvas
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: 'var(--primary)', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' }
          },
          eds
        )
      ),
    [setEdges]
  );

  const addNodeToCanvas = (type: string) => {
    const id = `node-${Date.now()}`;
    const x = 250 + (nodes.length * 20) % 200;
    const y = 150 + (nodes.length * 40) % 200;
    
    let defaultData: any = { label: 'Novo Bloco' };
    if (type === 'webFlow') {
      defaultData = { label: 'Navegação Web', url: 'https://', steps: [] };
    } else if (type === 'ifCondition') {
      defaultData = { label: 'Se (Condição)', selector: '' };
    } else if (type === 'postgresQuery') {
      defaultData = { label: 'Consulta Postgres', query: 'SELECT * FROM users;', variableName: 'dbUser', connectionString: '' };
    } else if (type === 'httpCall') {
      defaultData = { label: 'API Call', method: 'GET', url: 'https://api.exemplo.com', body: '', variableName: 'apiResult' };
    } else if (type === 'logNode') {
      defaultData = { label: 'Console Log', message: 'Mensagem de log...' };
    } else if (type === 'stopAndFail') {
      defaultData = { label: 'Falha do Fluxo', message: 'Erro na validação do fluxo' };
    }

    const newNode = {
      id,
      type,
      position: { x, y },
      data: defaultData,
    };
    
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setDirty(true);
  };

  const removeNodeFromCanvas = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setDirty(true);
  };

  // Sync edits across editor tabs
  const handleTabChange = (tab: 'canvas' | 'list' | 'runs') => {
    if (tab === 'list' && activeTab === 'canvas') {
      // Sync list steps from visual canvas layout
      setSteps(compileCanvasToSteps(nodes, edges));
    } else if (tab === 'canvas' && activeTab === 'list') {
      // Re-generate visual canvas sequence from steps list
      const canvas = compileStepsToCanvas(steps);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
    }
    setActiveTab(tab);
  };

  // Save changes to database
  const save = useMutation({
    mutationFn: () => {
      let finalSteps: any = [];
      if (activeTab === 'canvas') {
        finalSteps = {
          editorMode: 'canvas',
          nodes,
          edges,
        };
      } else {
        finalSteps = steps.map((s, i) => ({ ...s, order: i + 1, _id: undefined }));
      }

      return testcasesApi.update(suiteId!, tcId!, {
        title: tc?.title || 'Sem título',
        description: tc?.description || '',
        steps: finalSteps,
        tags,
        priority: tc?.priority || 'medium',
        status: tc?.status || 'active',
        type: tc?.type || 'web',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tc'] });
      setDirty(false);
      toast.success('Test Case salvo com sucesso');
    },
    onError: () => toast.error('Erro ao salvar os passos de teste'),
  });

  // Run execution
  const runExec = useMutation({
    mutationFn: () =>
      executionsApi.create({
        test_case_id: tcId!,
        browsers: ['chromium'],
        video_enabled: runVideo,
        screenshot_enabled: runScreenshot,
        timeout: 60000,
      }),
    onSuccess: (res) => navigate(`/executions/${res.data.execution.id}`),
    onError: () => toast.error('Erro ao agendar execução no agente'),
  });

  // Tag Management
  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setDirty(true);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    setDirty(true);
  };

  // Node parameter updates (Right configuration panel)
  const selectedNode = nodes.find((n: any) => n.id === selectedNodeId);

  const updateNodeData = (nodeId: string, key: string, val: any) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, [key]: val } };
        }
        return n;
      })
    );
    setDirty(true);
  };

  // Classic List Step handlers
  const addStep = useCallback((type: string) => {
    const meta = getStepMeta(type);
    if (!meta) return;
    const params: any = {};
    for (const f of meta.fields) params[f.key] = f.type === 'number' ? '1000' : '';
    const newStep = { type, order: steps.length + 1, params, _id: Date.now() };
    setSteps(prev => [...prev, newStep]);
    setExpandedIdx(steps.length);
    setDirty(true);
  }, [steps.length]);

  const updateParam = (idx: number, key: string, value: string) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, params: { ...s.params, [key]: value } } : s));
    setDirty(true);
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setExpandedIdx(null);
    setDirty(true);
  };

  const moveStep = (from: number, to: number) => {
    setSteps(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 0px)' }}>
      
      {/* Top Toolbar Navigation */}
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>{tc?.title || '...'}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {activeTab === 'canvas' ? `${nodes.length} blocos visuais` : `${steps.length} passos sequenciais`}
            </p>
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Tab Selector: Canvas vs Steps List vs Executions History */}
        <div className="flex items-center bg-surface-2 border border-border p-0.5 rounded-lg mr-4">
          <button
            onClick={() => handleTabChange('canvas')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'canvas' ? 'bg-primary text-white shadow-glow' : 'text-text-muted hover:text-text'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Canvas
          </button>
          <button
            onClick={() => handleTabChange('list')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'list' ? 'bg-primary text-white shadow-glow' : 'text-text-muted hover:text-text'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" /> Passos
          </button>
          <button
            onClick={() => handleTabChange('runs')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'runs' ? 'bg-primary text-white shadow-glow' : 'text-text-muted hover:text-text'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Execuções
          </button>
        </div>

        {dirty && <span className="text-xs text-warning font-medium">● não salvo</span>}

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:text-text transition-colors"
          onClick={() => save.mutate()}
          disabled={save.isPending || !dirty}
        >
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          onClick={() => setShowRunModal(true)}
        >
          <Play className="w-3.5 h-3.5" /> Executar
        </button>
      </div>

      {/* Editor Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* VIEW 1: REACT FLOW CANVAS */}
        {activeTab === 'canvas' && (
          <div className="flex flex-1 overflow-hidden relative">
            
            {/* Sidebar Palette - Left */}
            <div className="w-56 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Paleta de Blocos</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                <button
                  onClick={() => addNodeToCanvas('webFlow')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Fluxo Web</span>
                    <span className="text-[9px] text-text-muted font-mono">WEB-FLOW</span>
                  </div>
                </button>
                <button
                  onClick={() => addNodeToCanvas('ifCondition')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
                    <GitBranch className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Bloco Se</span>
                    <span className="text-[9px] text-text-muted font-mono">IF</span>
                  </div>
                </button>
                <button
                  onClick={() => addNodeToCanvas('postgresQuery')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                    <Database className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">PostgreSQL</span>
                    <span className="text-[9px] text-text-muted font-mono">DB QUERY</span>
                  </div>
                </button>
                <button
                  onClick={() => addNodeToCanvas('httpCall')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Chamada API</span>
                    <span className="text-[9px] text-text-muted font-mono">HTTP REQUEST</span>
                  </div>
                </button>
                <button
                  onClick={() => addNodeToCanvas('logNode')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                    <Terminal className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Log</span>
                    <span className="text-[9px] text-text-muted font-mono">LOG MESSAGE</span>
                  </div>
                </button>
                <button
                  onClick={() => addNodeToCanvas('stopAndFail')}
                  className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg border border-border hover:bg-surface-2 text-left text-xs transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400">
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Falhar</span>
                    <span className="text-[9px] text-text-muted font-mono">STOP & FAIL</span>
                  </div>
                </button>
              </div>
            </div>

            {/* React Flow Graph Engine */}
            <div className="flex-1 h-full bg-[#0a0d14]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={customNodeTypes}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                fitView
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#2a3352" />
                <Controls />
                <MiniMap style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }} />
              </ReactFlow>
            </div>

            {/* Right Node Parameter Config Panel */}
            {selectedNode && (
              <div className="w-72 border-l flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-bold uppercase tracking-wider text-text">Configurações do Bloco</span>
                  <button onClick={() => setSelectedNodeId(null)} className="btn-ghost p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  
                  {/* General Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-text-muted">Etiqueta do Bloco</label>
                    <input
                      className="input"
                      value={selectedNode.data?.label || ''}
                      onChange={(e) => updateNodeData(selectedNode.id, 'label', e.target.value)}
                    />
                  </div>

                  {/* Web Flow Parameters */}
                  {selectedNode.type === 'webFlow' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">URL do Navegador</label>
                        <input
                          className="input"
                          value={selectedNode.data?.url || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'url', e.target.value)}
                          placeholder="https://exemplo.com"
                        />
                      </div>
                      <div className="space-y-2 pt-2 border-t border-border">
                        <label className="text-[10px] uppercase font-bold text-text-muted block">Passos Internos ({selectedNode.data?.steps?.length || 0})</label>
                        <button
                          onClick={() => {
                            const currentSteps = selectedNode.data?.steps || [];
                            const updated = [...currentSteps, { type: 'click', params: { selector: 'button' } }];
                            updateNodeData(selectedNode.id, 'steps', updated);
                          }}
                          className="btn-primary w-full text-xs flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Adicionar Passo
                        </button>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {(selectedNode.data?.steps || []).map((st: any, sIdx: number) => (
                            <div key={sIdx} className="flex items-center gap-2 p-1.5 bg-surface-2 border border-border rounded text-[11px]">
                              <span className="font-mono text-cyan-400">{st.type}</span>
                              <input
                                className="bg-transparent outline-none flex-1 font-mono text-[10px]"
                                value={st.params?.selector || st.params?.url || ''}
                                onChange={(e) => {
                                  const cSteps = [...(selectedNode.data?.steps || [])];
                                  const paramKey = st.type === 'goto' ? 'url' : 'selector';
                                  cSteps[sIdx] = { ...st, params: { ...st.params, [paramKey]: e.target.value } };
                                  updateNodeData(selectedNode.id, 'steps', cSteps);
                                }}
                              />
                              <button
                                onClick={() => {
                                  const cSteps = (selectedNode.data?.steps || []).filter((_: any, idx: number) => idx !== sIdx);
                                  updateNodeData(selectedNode.id, 'steps', cSteps);
                                }}
                                className="text-red-400 hover:text-red-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* If Conditional Parameters */}
                  {selectedNode.type === 'ifCondition' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text-muted">Seletor de Elemento Visível</label>
                      <input
                        className="input font-mono"
                        placeholder="Ex: #login-button"
                        value={selectedNode.data?.selector || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, 'selector', e.target.value)}
                      />
                    </div>
                  )}

                  {/* Postgres Parameters */}
                  {selectedNode.type === 'postgresQuery' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">String de Conexão (Postgres)</label>
                        <input
                          className="input font-mono"
                          placeholder="postgresql://user:pass@host:5432/db"
                          value={selectedNode.data?.connectionString || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'connectionString', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">Consulta SQL</label>
                        <textarea
                          className="input font-mono text-xs h-24"
                          placeholder="SELECT email FROM users LIMIT 1;"
                          value={selectedNode.data?.query || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'query', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">Armazenar resultado em</label>
                        <input
                          className="input font-mono"
                          value={selectedNode.data?.variableName || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'variableName', e.target.value)}
                          placeholder="dbUser"
                        />
                      </div>
                    </>
                  )}

                  {/* HTTP Call Parameters */}
                  {selectedNode.type === 'httpCall' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">Método HTTP</label>
                        <select
                          className="input"
                          value={selectedNode.data?.method || 'GET'}
                          onChange={(e) => updateNodeData(selectedNode.id, 'method', e.target.value)}
                        >
                          <option>GET</option>
                          <option>POST</option>
                          <option>PUT</option>
                          <option>DELETE</option>
                          <option>PATCH</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">URL da Requisição</label>
                        <input
                          className="input"
                          placeholder="https://api.site.com/v1/users"
                          value={selectedNode.data?.url || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'url', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-text-muted">Payload JSON (Body)</label>
                        <textarea
                          className="input font-mono text-xs h-20"
                          placeholder='{"name": "test"}'
                          value={selectedNode.data?.body || ''}
                          onChange={(e) => updateNodeData(selectedNode.id, 'body', e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Log Parameters */}
                  {selectedNode.type === 'logNode' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text-muted">Mensagem a registrar</label>
                      <input
                        className="input"
                        value={selectedNode.data?.message || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, 'message', e.target.value)}
                      />
                    </div>
                  )}

                  {/* Stop and Fail Parameters */}
                  {selectedNode.type === 'stopAndFail' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-text-muted">Mensagem do erro</label>
                      <input
                        className="input"
                        value={selectedNode.data?.message || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, 'message', e.target.value)}
                      />
                    </div>
                  )}

                  {/* Delete Node action */}
                  <button
                    onClick={() => removeNodeFromCanvas(selectedNode.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold mt-4"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remover Bloco
                  </button>

                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: TRADITIONAL STEPS LIST */}
        {activeTab === 'list' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Catalog sidebar - Left */}
            <div className="w-64 border-r flex flex-col flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Estações</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {STEP_CATALOG.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>{group.group}</p>
                    <div className="space-y-0.5">
                      {group.items.map(item => {
                        const Icon = item.icon;
                        const colorClass = COLOR_MAP[item.color] || COLOR_MAP.blue;
                        return (
                          <button
                            key={item.type}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left hover:bg-surface-2 group"
                            style={{ color: 'var(--text)' }}
                            onClick={() => addStep(item.type)}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${colorClass}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{item.label}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step list Container */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <Plus className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Nenhum step ainda</p>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Adicione passos na paleta esquerda para montar seu teste</p>
                </div>
              )}

              {steps.map((step, idx) => {
                const meta = getStepMeta(step.type);
                if (!meta) return null;
                const Icon = meta.icon;
                const colorClass = COLOR_MAP[meta.color] || COLOR_MAP.blue;
                const isExpanded = expandedIdx === idx;

                return (
                  <div key={step._id ?? idx} className="card border rounded-xl overflow-hidden transition-all">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors select-none"
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      <span className="text-xs font-mono text-slate-600 w-5 flex-shrink-0">{idx + 1}</span>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${colorClass}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{meta.label}</span>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{meta.summary(step.params || {})}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 text-slate-600 transition-colors"
                          onClick={e => { e.stopPropagation(); removeStep(idx); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {idx > 0 && (
                          <button className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"
                            onClick={e => { e.stopPropagation(); moveStep(idx, idx - 1); }}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {idx < steps.length - 1 && (
                          <button className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"
                            onClick={e => { e.stopPropagation(); moveStep(idx, idx + 1); }}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                        {meta.fields.map(field => (
                          <div key={field.key}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
                            {field.type === 'select' ? (
                              <select
                                className="input w-full text-sm"
                                value={step.params?.[field.key] || ''}
                                onChange={e => updateParam(idx, field.key, e.target.value)}
                              >
                                {(field as any).options?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                className="input w-full text-sm font-mono"
                                type={field.type === 'number' ? 'number' : 'text'}
                                placeholder={field.placeholder}
                                value={step.params?.[field.key] || ''}
                                onChange={e => updateParam(idx, field.key, e.target.value)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: RUNS HISTORY */}
        {activeTab === 'runs' && (
          <div className="flex flex-1 overflow-y-auto flex-col px-8 py-6">
            <h2 className="text-base font-bold mb-4">Histórico de Execuções</h2>
            
            {/* Metadata info */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="bg-surface-1 border border-border p-4 rounded-xl flex-1 min-w-[200px]">
                <span className="text-xs text-text-muted block font-medium uppercase tracking-wider">Total de Execuções</span>
                <span className="text-2xl font-bold font-mono mt-1 block">{execHistory.length}</span>
              </div>
              <div className="bg-surface-1 border border-border p-4 rounded-xl flex-1 min-w-[200px]">
                <span className="text-xs text-text-muted block font-medium uppercase tracking-wider">Taxa de Sucesso</span>
                <span className="text-2xl font-bold font-mono mt-1 text-green-400 block">
                  {execHistory.length > 0
                    ? `${Math.round((execHistory.filter(h => h.status === 'passed').length / execHistory.length) * 100)}%`
                    : '0%'}
                </span>
              </div>
              {flakiness !== null && (
                <div className="bg-surface-1 border border-border p-4 rounded-xl flex-1 min-w-[200px]">
                  <span className="text-xs text-text-muted block font-medium uppercase tracking-wider">Instabilidade (Flaky)</span>
                  <span className={`text-2xl font-bold font-mono mt-1 block ${flakiness > 0.3 ? 'text-amber-400' : 'text-green-400'}`}>
                    {Math.round(flakiness * 100)}%
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {execHistory.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-muted border border-dashed border-border rounded-xl">
                  Nenhuma execução agendada ou executada recentemente.
                </div>
              ) : (
                execHistory.map((exec) => (
                  <div
                    key={exec.id}
                    className="flex items-center gap-4 bg-surface-1 border border-border p-4 rounded-xl hover:bg-surface-2 cursor-pointer transition-colors"
                    onClick={() => navigate(`/executions/${exec.id}`)}
                  >
                    <div className="flex-shrink-0">
                      {exec.status === 'passed' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                      {exec.status === 'failed' && <XCircle className="w-5 h-5 text-red-400" />}
                      {exec.status === 'error' && <AlertCircle className="w-5 h-5 text-warning" />}
                      {(exec.status === 'running' || exec.status === 'queued') && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text">Run #{exec.id.slice(0, 8)}</span>
                        <span className="text-xs text-text-muted">{formatDate(exec.created_at)}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-1 truncate">
                        Agente: {exec.agent_name || '—'} · Navegador: {exec.browsers ? JSON.parse(exec.browsers).join(', ') : 'chromium'}
                      </p>
                    </div>
                    {exec.duration_ms && (
                      <div className="text-xs text-text-muted font-mono">
                        {formatDuration(exec.duration_ms)}
                      </div>
                    )}
                    <ExternalLink className="w-4 h-4 text-text-muted" />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Execution modal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card rounded-xl w-full max-w-md p-5 shadow-glow space-y-4">
            <h2 className="text-base font-bold">Iniciar Execução</h2>
            <p className="text-xs text-text-muted">A execução será enviada em tempo real para um agente remoto disponível na rede.</p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={runScreenshot}
                  onChange={(e) => setRunScreenshot(e.target.checked)}
                  className="rounded border-border text-primary bg-surface-2 focus:ring-primary focus:ring-offset-0"
                />
                Gerar Capturas de Tela (Screenshots)
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-text cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={runVideo}
                  onChange={(e) => setRunVideo(e.target.checked)}
                  className="rounded border-border text-primary bg-surface-2 focus:ring-primary focus:ring-offset-0"
                />
                Gravar Vídeo de Execução
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                className="btn-ghost flex-1 border border-border"
                onClick={() => setShowRunModal(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                disabled={runExec.isPending}
                onClick={() => {
                  save.mutate();
                  runExec.mutate();
                }}
              >
                {runExec.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Disparar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
