export type TunnelMessageType =
  | 'client_hello'
  | 'server_hello'
  | 'create_tunnel'
  | 'tunnel_created'
  | 'http_request'
  | 'http_response'
  | 'ping'
  | 'pong'
  | 'tunnel_expiring'
  | 'tunnel_expired'
  | 'disconnect'
  | 'error';

export interface TunnelMessage<T = any> {
  type: TunnelMessageType;
  requestId?: string;
  tunnelId?: string;
  timestamp: number;
  payload?: T;
}

export interface ClientHelloPayload {
  token: string;
  clientVersion?: string;
  clientId?: string;
}

export interface ServerHelloPayload {
  serverVersion: string;
  authenticated: boolean;
  maxBodySize: number;
  allowedDurations: number[]; // seconds
  message?: string;
}

export interface CreateTunnelPayload {
  port: number;
  durationSeconds?: number;
  label?: string;
  customTunnelId?: string; // only if privileged/authorized
}

export interface TunnelCreatedPayload {
  tunnelId: string;
  publicUrl: string;
  localPort: number;
  createdAt: number;
  expiresAt: number;
  durationSeconds: number;
  maxBodySize: number;
}

export interface HttpRequestPayload {
  requestId: string;
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body?: string; // UTF-8 text or base64
  isBase64?: boolean;
}

export interface HttpResponsePayload {
  requestId: string;
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: string; // UTF-8 text or base64
  isBase64?: boolean;
  durationMs?: number;
}

export interface TunnelExpiringPayload {
  remainingSeconds: number;
  expiresAt: number;
}

export interface TunnelExpiredPayload {
  reason: 'timeout' | 'idle' | 'manual' | 'server_shutdown';
  message: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: any;
}

/**
 * Creates a standard protocol message.
 */
export function createMessage<T>(
  type: TunnelMessageType,
  payload?: T,
  tunnelId?: string,
  requestId?: string
): TunnelMessage<T> {
  return {
    type,
    requestId,
    tunnelId,
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Safely stringifies a protocol message.
 */
export function serializeMessage<T>(msg: TunnelMessage<T>): string {
  return JSON.stringify(msg);
}

/**
 * Safely parses an incoming message.
 */
export function parseMessage(data: string | Buffer): TunnelMessage | null {
  try {
    const raw = typeof data === 'string' ? data : data.toString('utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.type) {
      return null;
    }
    return parsed as TunnelMessage;
  } catch {
    return null;
  }
}
