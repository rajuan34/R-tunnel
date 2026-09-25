import dotenv from 'dotenv';
dotenv.config();

function parseBytes(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) return defaultValue;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'b').toLowerCase();
  switch (unit) {
    case 'kb': return Math.round(num * 1024);
    case 'mb': return Math.round(num * 1024 * 1024);
    case 'gb': return Math.round(num * 1024 * 1024 * 1024);
    default: return Math.round(num);
  }
}

function parseDurationSeconds(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const match = value.trim().match(/^(\d+)\s*(s|m|h|d)?$/i);
  if (!match) return defaultValue;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return num;
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // Use port 3000 for local/AI Studio dev, fallback to PORT env (Render sets PORT e.g. 10000)
  port: Number(process.env.PORT || 3000),
  host: '0.0.0.0',

  // Public domain and URL resolution
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '',
  publicBaseDomain: (process.env.PUBLIC_BASE_DOMAIN || '').trim().toLowerCase(),

  // Authentication
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'rajuanr34',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  tunnelMasterToken: process.env.TUNNEL_MASTER_TOKEN || '',
  sessionSecret: process.env.SESSION_SECRET || 'r-tunnel-default-session-secret-change-in-prod',

  // Limits
  maxActiveTunnels: parseInt(process.env.MAX_ACTIVE_TUNNELS || '10', 10),
  maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '120', 10),
  maxBodySize: parseBytes(process.env.MAX_BODY_SIZE, 10 * 1024 * 1024), // 10MB
  maxWsMessageSize: parseBytes(process.env.MAX_WS_MESSAGE_SIZE, 12 * 1024 * 1024), // 12MB

  // Durations & Timeouts
  defaultTunnelDuration: parseDurationSeconds(process.env.DEFAULT_TUNNEL_DURATION, 3600), // 1 hour
  maxTunnelDuration: parseDurationSeconds(process.env.MAX_TUNNEL_DURATION, 10800), // 3 hours
  idleTimeoutMinutes: parseInt(process.env.IDLE_TIMEOUT_MINUTES || '0', 10), // 0 = disabled
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10), // 30s

  // Logging
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
};
