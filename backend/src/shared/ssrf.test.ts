import { describe, it, expect, vi } from 'vitest';
import dns from 'dns';
import { isSafeUrl } from './ssrf';

vi.mock('dns', () => {
  return {
    default: {
      lookup: (hostname: string, options: any, callback: any) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        
        const resolveTo = (ips: string[]) => {
          callback(null, ips.map(ip => ({ address: ip, family: ip.includes(':') ? 6 : 4 })));
        };

        if (hostname === 'safe-domain.com') {
          resolveTo(['8.8.8.8', '1.1.1.1']);
        } else if (hostname === 'private-class-a.com') {
          resolveTo(['10.0.0.1']);
        } else if (hostname === 'private-class-b.com') {
          resolveTo(['172.16.5.5']);
        } else if (hostname === 'private-class-c.com') {
          resolveTo(['192.168.1.1']);
        } else if (hostname === 'link-local.com') {
          resolveTo(['169.254.169.254']);
        } else if (hostname === 'ipv6-loopback.com') {
          resolveTo(['::1']);
        } else if (hostname === 'ipv6-private.com') {
          resolveTo(['fd00::1']);
        } else if (hostname === 'rebinding-attack.com') {
          // One safe, one unsafe -> should fail
          resolveTo(['8.8.8.8', '127.0.0.1']);
        } else if (hostname === 'invalid-dns.com') {
          callback(new Error('DNS Error'), null);
        } else {
          resolveTo(['127.0.0.1']);
        }
      }
    }
  };
});

describe('SSRF Protection - isSafeUrl', () => {
  it('should allow safe public domains', async () => {
    const res = await isSafeUrl('https://safe-domain.com/path');
    expect(res).toBe(true);
  });

  it('should block explicit hostnames like localhost, backend', async () => {
    expect(await isSafeUrl('http://localhost')).toBe(false);
    expect(await isSafeUrl('http://backend/api')).toBe(false);
    expect(await isSafeUrl('http://loopback')).toBe(false);
  });

  it('should block non-http/https protocols', async () => {
    expect(await isSafeUrl('ftp://safe-domain.com')).toBe(false);
    expect(await isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('should block private IPv4 ranges', async () => {
    expect(await isSafeUrl('https://private-class-a.com')).toBe(false);
    expect(await isSafeUrl('https://private-class-b.com')).toBe(false);
    expect(await isSafeUrl('https://private-class-c.com')).toBe(false);
    expect(await isSafeUrl('https://link-local.com')).toBe(false);
  });

  it('should block private/loopback IPv6 ranges', async () => {
    expect(await isSafeUrl('https://ipv6-loopback.com')).toBe(false);
    expect(await isSafeUrl('https://ipv6-private.com')).toBe(false);
  });

  it('should block if ANY resolved IP is private (mitigates multi-IP / rebinding bypasses)', async () => {
    expect(await isSafeUrl('https://rebinding-attack.com')).toBe(false);
  });

  it('should block if DNS resolution fails', async () => {
    expect(await isSafeUrl('https://invalid-dns.com')).toBe(false);
  });

  it('should block invalid URLs', async () => {
    expect(await isSafeUrl('not-a-url')).toBe(false);
  });
});
