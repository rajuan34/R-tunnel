import { Request } from 'express';
import { config } from '../config.js';

export function getBaseUrl(req?: Request): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/+$/, '');
  }
  if (config.renderExternalUrl) {
    return config.renderExternalUrl.replace(/\/+$/, '');
  }
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.port}`;
    return `${proto}://${host}`;
  }
  return `http://localhost:${config.port}`;
}

export function buildPublicUrl(tunnelId: string, req?: Request): string {
  if (config.publicBaseDomain) {
    // Subdomain mode: https://<tunnelId>.<publicBaseDomain>
    const proto = req ? (req.headers['x-forwarded-proto'] || req.protocol || 'https') : 'https';
    return `${proto}://${tunnelId}.${config.publicBaseDomain}`;
  }
  // Path-based fallback: https://<host>/t/<tunnelId>
  const base = getBaseUrl(req);
  return `${base}/t/${tunnelId}`;
}

export function extractTunnelIdFromHost(hostname: string): string | null {
  if (!config.publicBaseDomain) return null;
  const cleanHost = hostname.split(':')[0].toLowerCase();
  const domain = config.publicBaseDomain.toLowerCase();
  if (cleanHost.endsWith(`.${domain}`)) {
    const sub = cleanHost.slice(0, -(domain.length + 1));
    // Verify valid tunnel ID syntax (lowercase alphanumeric 6-32 chars)
    if (/^[a-z0-9]{6,32}$/.test(sub)) {
      return sub;
    }
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
  ].join(':');
}
