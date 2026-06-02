import dns from 'dns';
import net from 'net';

export function parseJSON<T = unknown>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Redacts secrets from a string or object before saving to disk/DB.
 * Masks: AWS keys, JWT tokens, API keys, passwords, bearer tokens, private keys.
 */
export function redactSecrets(input: string): string;
export function redactSecrets(input: object): Record<string, unknown> | unknown[];
export function redactSecrets(input: string | object): string | Record<string, unknown> | unknown[] {
  if (typeof input === 'object') {
    return redactObject(input) as Record<string, unknown> | unknown[];
  }

  let output = input;

  // AWS Access Key ID
  output = output.replace(/(AKIA[0-9A-Z]{16})/g, '[REDACTED_AWS_KEY]');
  // AWS Secret Key
  output = output.replace(/([A-Za-z0-9/+=]{40})(?=\s*["']?\s*[,}\]])/g, (match) => {
    if (/[A-Za-z0-9/+=]{40}/.test(match) && !match.includes(' ')) {
      return '[REDACTED]';
    }
    return match;
  });
  // JWT tokens (eyJ...)
  output = output.replace(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, '[REDACTED_JWT]');
  // Bearer tokens
  output = output.replace(/(Bearer\s+[A-Za-z0-9._-]{10,})/gi, 'Bearer [REDACTED]');
  // API keys (common patterns)
  output = output.replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9_-]{8,}/gi, '$1[REDACTED]');
  // Password values in JSON
  output = output.replace(/("password["']?\s*:\s*["'])[^\"]+(")/gi, '$1[REDACTED]$2');
  // Private keys
  output = output.replace(/(-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/g, '[REDACTED_PRIVATE_KEY]');
  // Generic secrets (long base64-like strings near secret/token keywords)
  output = output.replace(/(secret|token|credential)["']?\s*[:=]\s*["']?([A-Za-z0-9+/=]{20,})/gi, '$1: [REDACTED]');

  return output;
}

function redactObject(obj: unknown): string | Record<string, unknown> | unknown[] {
  if (obj === null || obj === undefined) return {};
  if (typeof obj === 'string') return redactSecrets(obj);
  if (typeof obj !== 'object') return { value: obj };

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (['password', 'secret', 'token', 'api_key', 'apikey', 'accesskey', 'privatekey', 'credential', 'auth'].some(k => lowerKey.includes(k))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactObject(value);
    }
  }
  return result;
}

/**
 * Validates a webhook URL against SSRF attacks.
 * Blocks: localhost, private IPs, loopback, link-local, metadata endpoints.
 * Only allows https:// (http:// blocked in production).
 */
export function validateWebhookUrl(url: string): { valid: true } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'URL inválida' };
  }

  // Only allow HTTPS (except in dev)
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    return { valid: false, reason: 'Apenas URLs HTTPS são permitidas em produção' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: 'Protocolo não suportado. Use http:// ou https://' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block obvious internal hosts
  const blockedHosts = [
    'localhost', '127.0.0.1', '::1', '0.0.0.0',
    'metadata.google.internal', '169.254.169.254',
    'instance-data', 'metadata.azure.com',
    '100.100.100.200', // Alibaba Cloud metadata
  ];
  if (blockedHosts.includes(hostname)) {
    return { valid: false, reason: `Host bloqueado: ${hostname}` };
  }

  // Block private/reserved IP ranges
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return { valid: false, reason: `IP privado/reservado bloqueado: ${hostname}` };
    }
    return { valid: true };
  }

  // For hostnames, do a DNS lookup and check the resolved IP
  // (async — caller should await if hostname is not an IP)
  return { valid: true }; // hostname check deferred to asyncValidateWebhookUrl
}

/**
 * Async version: resolves DNS and checks if the IP is private.
 */
export async function asyncValidateWebhookUrl(url: string): Promise<{ valid: true } | { valid: false; reason: string }> {
  const syncResult = validateWebhookUrl(url);
  if (!syncResult.valid) return syncResult;

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  if (net.isIP(hostname)) return syncResult; // already checked

  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        return { valid: false, reason: `DNS resolveu para IP privado: ${addr.address}` };
      }
    }
  } catch {
    return { valid: false, reason: `Não foi possível resolver o hostname: ${hostname}` };
  }

  return { valid: true };
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts.every(n => n === 0)) return true;
    return false;
  }

  // IPv6 checks
  if (ip.includes(':')) {
    if (ip === '::1' || ip.startsWith('::') || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
      return true;
    }
    if (ip.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — check the embedded IPv4
      return isPrivateIP(ip.replace('::ffff:', ''));
    }
  }

  return false;
}
