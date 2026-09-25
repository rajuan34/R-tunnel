import { WebSocket } from 'ws';
import { config } from '../config.js';
import { generateTunnelId, generateRequestId } from '../utils/crypto.js';
import { buildPublicUrl } from '../utils/helpers.js';
import { validateTunnelRequest } from '../security/ssrf.js';
import { logger } from '../logging/logger.js';
import { TunnelRecord, TunnelStatus, SystemStats } from './tunnel.model.js';
import { tunnelStore, ITunnelStore } from './tunnel.store.js';
import {
  createMessage,
  serializeMessage,
  HttpRequestPayload,
  HttpResponsePayload,
  TunnelExpiredPayload,
  TunnelExpiringPayload,
} from '../websocket/protocol.js';
import { dashboardWsManager } from '../websocket/dashboard.ws.js';

interface PendingRequest {
  resolve: (res: HttpResponsePayload) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  startTime: number;
  tunnelId: string;
}

export class TunnelManager {
  private store: ITunnelStore;
  private clientSockets = new Map<string, WebSocket>(); // tunnelId -> WebSocket
  private pendingRequests = new Map<string, PendingRequest>(); // requestId -> PendingRequest
  private warnedExpiring = new Set<string>(); // tunnelIds warned
  private startTime = Date.now();

  constructor(store: ITunnelStore = tunnelStore) {
    this.store = store;
    // Start expiration & inactivity monitor loop
    setInterval(() => this.monitorTunnels(), 5000).unref();
  }

  /**
   * Creates a new tunnel record.
   */
  async createTunnel(options: {
    port: number;
    durationSeconds?: number;
    label?: string;
    customTunnelId?: string;
    clientIp?: string;
    clientId?: string;
  }): Promise<{ tunnel: TunnelRecord; error?: string }> {
    // Check global active tunnel limit
    const active = await this.store.getActive();
    if (active.length >= config.maxActiveTunnels) {
      return {
        tunnel: null as any,
        error: `Active tunnel limit reached (${config.maxActiveTunnels}). Please wait or stop an existing tunnel.`,
      };
    }

    // SSRF & parameter validation
    const duration = options.durationSeconds || config.defaultTunnelDuration;
    const validation = validateTunnelRequest({
      port: options.port,
      durationSeconds: duration,
      maxDuration: config.maxTunnelDuration,
    });
    if (!validation.valid) {
      return { tunnel: null as any, error: validation.error };
    }

    // Generate or validate ID
    let tunnelId = options.customTunnelId ? options.customTunnelId.toLowerCase() : generateTunnelId(8);
    // Ensure no ID collisions
    let existing = await this.store.get(tunnelId);
    let attempts = 0;
    while (existing && attempts < 5) {
      tunnelId = generateTunnelId(8);
      existing = await this.store.get(tunnelId);
      attempts++;
    }

    const now = Date.now();
    const publicUrl = buildPublicUrl(tunnelId);

    const tunnel: TunnelRecord = {
      id: tunnelId,
      localPort: options.port,
      label: options.label || `Port ${options.port}`,
      createdAt: now,
      expiresAt: now + duration * 1000,
      durationSeconds: duration,
      lastActivity: now,
      status: 'connecting',
      publicUrl,
      requestCount: 0,
      bytesIn: 0,
      bytesOut: 0,
      clientIp: options.clientIp,
      clientId: options.clientId,
    };

    await this.store.set(tunnel);
    logger.info('Tunnel created', { tunnelId, port: options.port, durationSeconds: duration });
    dashboardWsManager.broadcast('tunnel_created', tunnel);

    return { tunnel };
  }

  /**
   * Binds a connected WebSocket client to a tunnel.
   */
  async bindClientConnection(tunnelId: string, ws: WebSocket, clientIp?: string): Promise<boolean> {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) return false;
    if (tunnel.status === 'expired') return false;

    // If an existing socket exists for this tunnel, close it cleanly first
    const existing = this.clientSockets.get(tunnelId);
    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
      try {
        existing.send(
          serializeMessage(
            createMessage<TunnelExpiredPayload>('tunnel_expired', {
              reason: 'manual',
              message: 'New client connection established for this tunnel.',
            }, tunnelId)
          )
        );
        existing.close();
      } catch {}
    }

    this.clientSockets.set(tunnelId, ws);
    tunnel.status = 'connected';
    tunnel.lastActivity = Date.now();
    if (clientIp) tunnel.clientIp = clientIp;

    await this.store.set(tunnel);
    logger.info('Client bound to tunnel', { tunnelId, clientIp });
    dashboardWsManager.broadcast('tunnel_updated', tunnel);
    return true;
  }

  /**
   * Handles client WebSocket disconnect.
   */
  async handleClientDisconnect(tunnelId: string, ws?: WebSocket): Promise<void> {
    const currentWs = this.clientSockets.get(tunnelId);
    if (ws && currentWs !== ws) {
      // Disconnect came from an old/stale socket
      return;
    }

    this.clientSockets.delete(tunnelId);

    // Fail any pending requests for this tunnel with 502
    for (const [reqId, pending] of this.pendingRequests.entries()) {
      if (pending.tunnelId === tunnelId) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(reqId);
        pending.reject(new Error('Tunnel client disconnected while processing request'));
      }
    }

    const tunnel = await this.store.get(tunnelId);
    if (tunnel && tunnel.status !== 'expired') {
      tunnel.status = 'disconnected';
      await this.store.set(tunnel);
      logger.info('Tunnel client disconnected', { tunnelId });
      dashboardWsManager.broadcast('tunnel_updated', tunnel);
    }
  }

  /**
   * Dispatches an HTTP request to the connected Termux client via WebSocket.
   */
  async dispatchHttpRequest(
    tunnelId: string,
    reqPayload: HttpRequestPayload,
    timeoutMs: number = config.requestTimeoutMs
  ): Promise<HttpResponsePayload> {
    const ws = this.clientSockets.get(tunnelId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Tunnel client is offline or disconnected');
    }

    const tunnel = await this.store.get(tunnelId);
    if (!tunnel || tunnel.status === 'expired') {
      throw new Error('Tunnel is expired or no longer available');
    }

    // Update last activity and metrics
    const now = Date.now();
    tunnel.lastActivity = now;
    tunnel.requestCount += 1;
    if (reqPayload.body) {
      tunnel.bytesIn += reqPayload.isBase64
        ? Buffer.from(reqPayload.body, 'base64').length
        : Buffer.byteLength(reqPayload.body, 'utf-8');
    }
    await this.store.set(tunnel);

    return new Promise<HttpResponsePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqPayload.requestId);
        reject(new Error(`Tunnel request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(reqPayload.requestId, {
        resolve,
        reject,
        timer,
        startTime: Date.now(),
        tunnelId,
      });

      const message = createMessage('http_request', reqPayload, tunnelId, reqPayload.requestId);
      try {
        ws.send(serializeMessage(message));
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqPayload.requestId);
        reject(new Error(`Failed to transmit request to tunnel client: ${err.message}`));
      }
    });
  }

  /**
   * Handles incoming HTTP response from the Termux client.
   */
  async handleHttpResponse(resPayload: HttpResponsePayload, tunnelId?: string): Promise<void> {
    const pending = this.pendingRequests.get(resPayload.requestId);
    if (!pending) {
      logger.warn('Received response for unknown or timed out request', {
        requestId: resPayload.requestId,
      });
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(resPayload.requestId);

    resPayload.durationMs = Date.now() - pending.startTime;

    // Track response bytes
    if (pending.tunnelId) {
      const tunnel = await this.store.get(pending.tunnelId);
      if (tunnel) {
        if (resPayload.body) {
          const resBytes = resPayload.isBase64
            ? Buffer.from(resPayload.body, 'base64').length
            : Buffer.byteLength(resPayload.body, 'utf-8');
          tunnel.bytesOut += resBytes;
        }
        await this.store.set(tunnel);
      }
    }

    pending.resolve(resPayload);
  }

  /**
   * Extends an active tunnel's duration.
   */
  async extendTunnel(
    tunnelId: string,
    additionalSeconds: number
  ): Promise<{ success: boolean; tunnel?: TunnelRecord; error?: string }> {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) {
      return { success: false, error: 'Tunnel not found' };
    }
    if (tunnel.status === 'expired') {
      return { success: false, error: 'Cannot extend an expired tunnel' };
    }

    const maxAllowedExpiresAt = tunnel.createdAt + config.maxTunnelDuration * 1000;
    const newExpiresAt = tunnel.expiresAt + additionalSeconds * 1000;

    if (newExpiresAt > maxAllowedExpiresAt) {
      return {
        success: false,
        error: `Extension would exceed maximum tunnel lifetime of ${config.maxTunnelDuration / 3600} hours.`,
      };
    }

    tunnel.expiresAt = newExpiresAt;
    tunnel.durationSeconds += additionalSeconds;
    if (tunnel.status === 'expiring') {
      tunnel.status = 'connected';
    }
    this.warnedExpiring.delete(tunnelId);

    await this.store.set(tunnel);
    logger.info('Tunnel extended', { tunnelId, additionalSeconds, newExpiresAt });
    dashboardWsManager.broadcast('tunnel_updated', tunnel);

    // Notify connected client
    const ws = this.clientSockets.get(tunnelId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          serializeMessage(
            createMessage<TunnelExpiringPayload>(
              'tunnel_expiring',
              {
                remainingSeconds: Math.max(0, Math.floor((tunnel.expiresAt - Date.now()) / 1000)),
                expiresAt: tunnel.expiresAt,
              },
              tunnelId
            )
          )
        );
      } catch {}
    }

    return { success: true, tunnel };
  }

  /**
   * Stops and expires a tunnel immediately.
   */
  async stopTunnel(tunnelId: string, reason: 'manual' | 'timeout' | 'idle' = 'manual'): Promise<boolean> {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) return false;

    tunnel.status = 'expired';
    await this.store.set(tunnel);

    const ws = this.clientSockets.get(tunnelId);
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            serializeMessage(
              createMessage<TunnelExpiredPayload>(
                'tunnel_expired',
                {
                  reason,
                  message: `Tunnel ${tunnelId} has been stopped (${reason}).`,
                },
                tunnelId
              )
            )
          );
          ws.close();
        }
      } catch {}
      this.clientSockets.delete(tunnelId);
    }

    logger.info('Tunnel stopped', { tunnelId, reason });
    dashboardWsManager.broadcast('tunnel_expired', { tunnelId, reason });
    return true;
  }

  /**
   * Periodically monitors expiration and idle timeouts.
   */
  private async monitorTunnels(): Promise<void> {
    const now = Date.now();
    const active = await this.store.getActive();

    for (const tunnel of active) {
      // 1. Check absolute expiration
      if (now >= tunnel.expiresAt) {
        await this.stopTunnel(tunnel.id, 'timeout');
        continue;
      }

      // 2. Check idle timeout if enabled
      if (config.idleTimeoutMinutes > 0) {
        const idleMs = now - tunnel.lastActivity;
        const maxIdleMs = config.idleTimeoutMinutes * 60 * 1000;
        if (idleMs > maxIdleMs) {
          await this.stopTunnel(tunnel.id, 'idle');
          continue;
        }
      }

      // 3. Check expiring warning (5 minutes remaining)
      const remainingSeconds = Math.floor((tunnel.expiresAt - now) / 1000);
      if (remainingSeconds <= 300 && !this.warnedExpiring.has(tunnel.id)) {
        this.warnedExpiring.add(tunnel.id);
        tunnel.status = 'expiring';
        await this.store.set(tunnel);
        dashboardWsManager.broadcast('tunnel_updated', tunnel);

        const ws = this.clientSockets.get(tunnel.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(
              serializeMessage(
                createMessage<TunnelExpiringPayload>(
                  'tunnel_expiring',
                  { remainingSeconds, expiresAt: tunnel.expiresAt },
                  tunnel.id
                )
              )
            );
          } catch {}
        }
      }
    }
  }

  /**
   * Get system-wide statistics for the dashboard.
   */
  async getSystemStats(): Promise<SystemStats> {
    const all = await this.store.getAll();
    const now = Date.now();
    let totalRequests = 0;
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let activeTunnels = 0;

    for (const t of all) {
      totalRequests += t.requestCount;
      totalBytesIn += t.bytesIn;
      totalBytesOut += t.bytesOut;
      if (t.status !== 'expired' && t.expiresAt > now) {
        activeTunnels++;
      }
    }

    return {
      activeTunnels,
      totalRequests,
      totalBytesIn,
      totalBytesOut,
      connectedClients: this.clientSockets.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      serverTime: Date.now(),
    };
  }

  isClientConnected(tunnelId: string): boolean {
    const ws = this.clientSockets.get(tunnelId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }
}

export const tunnelManager = new TunnelManager();
