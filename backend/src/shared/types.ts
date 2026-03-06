export type UserRole = 'admin' | 'tester' | 'viewer';
export type AgentStatus = 'online' | 'offline' | 'busy';
export type ExecutionStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
export type ArtifactType = 'video' | 'trace' | 'screenshot' | 'html_report' | 'json_report';
export type IntegrationType = 'discord' | 'slack' | 'jira' | 'jenkins' | 'teams' | 'google_chat';
export type TestType = 'web' | 'api' | 'mobile' | 'mixed';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ScheduleMode = 'run' | 'monitor';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface Step {
  id: string;
  type: 'goto' | 'click' | 'fill' | 'assert' | 'wait' | 'screenshot' | 'api_call' | 'group' | 'library_ref';
  label?: string;
  params: Record<string, unknown>;
  group?: string;
  is_secret?: boolean;
}

export interface ApiCallStep extends Step {
  type: 'api_call';
  params: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    assertions?: Array<{
      type: 'status_code' | 'body_contains' | 'json_path' | 'response_time_ms';
      expected: unknown;
      path?: string;
    }>;
  };
}

export interface RunConfig {
  execId: string;
  testCaseId?: string;
  scriptId?: string;
  steps?: Step[];
  scriptContent?: string;
  framework: string;
  language: string;
  browsers: string[];
  videoEnabled: boolean;
  timeout: number;
  variables?: Record<string, string>;
  backendUrl: string;
  agentToken: string;
}

export interface RunResult {
  status: ExecutionStatus;
  logs: string;
  duration_ms: number;
  steps?: Array<{
    step_index: number;
    name: string;
    status: StepStatus;
    duration_ms?: number;
    error_message?: string;
    screenshot_url?: string;
    timestamp_ms?: number;
  }>;
  artifacts?: Array<{
    type: ArtifactType;
    filename: string;
    data: Buffer;
  }>;
}
