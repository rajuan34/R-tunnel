export type TunnelStatus = 'connecting' | 'connected' | 'disconnected' | 'expiring' | 'expired';

export interface TunnelRecord {
  id: string; // e.g. "x7k29m4p"
  localPort: number;
  label?: string;
  createdAt: number;
  expiresAt: number;
  durationSeconds: number;
  lastActivity: number;
  status: TunnelStatus;
  publicUrl: string;
  requestCount: number;
  bytesIn: number;
  bytesOut: number;
  clientIp?: string;
  clientToken?: string;
  clientId?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  tunnelId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  requestSizeBytes: number;
  responseSizeBytes: number;
  clientIp?: string;
}

export interface SystemStats {
  activeTunnels: number;
  totalRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  connectedClients: number;
  uptimeSeconds: number;
  serverTime: number;
  avgLatencyMs?: number;
  maxActiveTunnels: number;
  maxDurationHours: number;
  maxBodySizeMb: number;
  memoryUsageMb: number;
}
