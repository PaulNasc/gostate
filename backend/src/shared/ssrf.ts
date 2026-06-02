import { URL } from 'url';
import dns from 'dns';

/**
 * Validates a URL against Server-Side Request Forgery (SSRF).
 * Resolves the host's DNS and checks if it falls within private or loopback IP ranges.
 */
export function isSafeUrl(urlString: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlString);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        resolve(false);
        return;
      }

      const hostname = parsed.hostname;

      // Block common local hostnames directly
      if (['localhost', 'loopback', 'backend'].includes(hostname.toLowerCase())) {
        resolve(false);
        return;
      }

      // Resolve DNS to verify the target IP address
      dns.lookup(hostname, (err, address) => {
        if (err || !address) {
          resolve(false);
          return;
        }

        // IPv4 validation
        const parts = address.split('.').map(Number);
        if (parts.length === 4) {
          // 127.0.0.0/8 (Loopback)
          if (parts[0] === 127) { resolve(false); return; }
          // 10.0.0.0/8 (Private Class A)
          if (parts[0] === 10) { resolve(false); return; }
          // 172.16.0.0/12 (Private Class B)
          if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) { resolve(false); return; }
          // 192.168.0.0/16 (Private Class C)
          if (parts[0] === 192 && parts[1] === 168) { resolve(false); return; }
          // 169.254.0.0/16 (Link-local / AWS metadata endpoint)
          if (parts[0] === 169 && parts[1] === 254) { resolve(false); return; }
        }

        // IPv6 validation
        const normalizedIp = address.toLowerCase();
        if (
          normalizedIp === '::1' ||
          normalizedIp.startsWith('fe80:') ||
          normalizedIp.startsWith('fc00:') ||
          normalizedIp.startsWith('fd00:')
        ) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
