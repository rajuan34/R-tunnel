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
  userId?: string;
  username?: string;
}

export interface SystemStats {
  activeTunnels: number;
  totalRequests: number;
  totalBytes: number;
  connectedClients: number;
  registeredUsers?: number;
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

export interface ManagedUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  note?: string;
  masterKey: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  maxTunnels: number;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt?: number;
  lastClientIp?: string;
  activeTunnelsCount?: number;
}

export interface AuthState {
  authenticated: boolean;
  role?: string;
  username?: string;
  userId?: string;
  checked: boolean;
}
