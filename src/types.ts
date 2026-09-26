export interface Tunnel {
  id: string;
  port: number;
  label?: string;
  createdAt: number;
  expiresAt: number;
  status: 'waiting' | 'connected' | 'reconnecting' | 'expired';
  publicUrl: string;
  subdomain?: string;
  token?: string;
  requestCount?: number;
  bytesTransferred?: number;
  lastPing?: number;
}

export interface SystemStats {
  activeTunnels: number;
  totalRequests: number;
  totalBytes: number;
  connectedClients: number;
  uptimeSeconds: number;
}

export interface TrafficLog {
  id: string;
  tunnelId: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytes: number;
  clientIp?: string;
}

export interface ApiToken {
  id: string;
  name: string;
  token?: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

export interface AuthState {
  authenticated: boolean;
  role?: string;
  username?: string;
  checked: boolean;
}
