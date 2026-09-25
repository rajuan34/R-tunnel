import { WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { config } from '../config.js';
import { logger } from '../logging/logger.js';
import { authService } from '../auth/auth.service.js';
import { tunnelManager } from '../tunnels/tunnel.manager.js';
import { tunnelStore } from '../tunnels/tunnel.store.js';
import {
  parseMessage,
  serializeMessage,
  createMessage,
  ClientHelloPayload,
  ServerHelloPayload,
  CreateTunnelPayload,
  TunnelCreatedPayload,
  HttpResponsePayload,
  ErrorPayload,
} from './protocol.js';

export function handleClientWebSocketConnection(ws: WebSocket, req: IncomingMessage): void {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';

  let isAuthenticated = false;
  let boundTunnelId: string | null = null;
  let isAlive = true;

  logger.info('Client WebSocket connected', { clientIp });

  // Heartbeat ping-pong
  const pingInterval = setInterval(() => {
    if (!isAlive) {
      logger.warn('Client heartbeat failed, terminating socket', { tunnelId: boundTunnelId });
      clearInterval(pingInterval);
      return ws.terminate();
    }
    isAlive = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 20000);

  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', async (data) => {
    const msg = parseMessage(data as any);
    if (!msg) {
      logger.warn('Received unparseable message from client', { clientIp });
      return;
    }

    try {
      switch (msg.type) {
        case 'ping': {
          ws.send(serializeMessage(createMessage('pong', {}, boundTunnelId || undefined, msg.requestId)));
          break;
        }

        case 'pong': {
          isAlive = true;
          break;
        }

        case 'client_hello': {
          const payload = msg.payload as ClientHelloPayload;
          if (!payload || !authService.verifyClientToken(payload.token)) {
            logger.warn('Client authentication failed', { clientIp });
            ws.send(
              serializeMessage(
                createMessage<ErrorPayload>('error', {
                  code: 'UNAUTHORIZED',
                  message: 'Authentication failed. Invalid tunnel token.',
                })
              )
            );
            ws.close(4001, 'Unauthorized');
            return;
          }

          isAuthenticated = true;
          logger.info('Client authenticated successfully', { clientIp, version: payload.clientVersion });

          const serverHello: ServerHelloPayload = {
            serverVersion: '1.0.0',
            authenticated: true,
            maxBodySize: config.maxBodySize,
            allowedDurations: [1800, 3600, 7200, 10800], // 30m, 1h, 2h, 3h
            message: 'Connected to R-Tunnel server',
          };
          ws.send(serializeMessage(createMessage('server_hello', serverHello, undefined, msg.requestId)));
          break;
        }

        case 'create_tunnel': {
          if (!isAuthenticated) {
            ws.send(
              serializeMessage(
                createMessage<ErrorPayload>('error', {
                  code: 'UNAUTHORIZED',
                  message: 'Handshake incomplete: Client must send client_hello first.',
                }, undefined, msg.requestId)
              )
            );
            return;
          }

          const payload = msg.payload as CreateTunnelPayload;
          if (!payload || !payload.port) {
            ws.send(
              serializeMessage(
                createMessage<ErrorPayload>('error', {
                  code: 'BAD_REQUEST',
                  message: 'Local port is required to create a tunnel.',
                }, undefined, msg.requestId)
              )
            );
            return;
          }

          // If reconnecting to an existing active tunnel
          if (payload.customTunnelId) {
            const existing = await tunnelStore.get(payload.customTunnelId);
            if (existing && existing.status !== 'expired' && existing.expiresAt > Date.now()) {
              boundTunnelId = existing.id;
              await tunnelManager.bindClientConnection(existing.id, ws, clientIp);

              const createdPayload: TunnelCreatedPayload = {
                tunnelId: existing.id,
                publicUrl: existing.publicUrl,
                localPort: existing.localPort,
                createdAt: existing.createdAt,
                expiresAt: existing.expiresAt,
                durationSeconds: existing.durationSeconds,
                maxBodySize: config.maxBodySize,
              };

              ws.send(serializeMessage(createMessage('tunnel_created', createdPayload, existing.id, msg.requestId)));
              return;
            }
          }

          // Create fresh tunnel
          const { tunnel, error } = await tunnelManager.createTunnel({
            port: payload.port,
            durationSeconds: payload.durationSeconds,
            label: payload.label,
            customTunnelId: payload.customTunnelId,
            clientIp,
          });

          if (error || !tunnel) {
            ws.send(
              serializeMessage(
                createMessage<ErrorPayload>('error', {
                  code: 'CREATION_FAILED',
                  message: error || 'Failed to create tunnel.',
                }, undefined, msg.requestId)
              )
            );
            return;
          }

          boundTunnelId = tunnel.id;
          await tunnelManager.bindClientConnection(tunnel.id, ws, clientIp);

          const createdPayload: TunnelCreatedPayload = {
            tunnelId: tunnel.id,
            publicUrl: tunnel.publicUrl,
            localPort: tunnel.localPort,
            createdAt: tunnel.createdAt,
            expiresAt: tunnel.expiresAt,
            durationSeconds: tunnel.durationSeconds,
            maxBodySize: config.maxBodySize,
          };

          ws.send(serializeMessage(createMessage('tunnel_created', createdPayload, tunnel.id, msg.requestId)));
          break;
        }

        case 'http_response': {
          const payload = msg.payload as HttpResponsePayload;
          if (payload && payload.requestId) {
            await tunnelManager.handleHttpResponse(payload, boundTunnelId || undefined);
          }
          break;
        }

        case 'disconnect': {
          logger.info('Client sent graceful disconnect message', { tunnelId: boundTunnelId });
          if (boundTunnelId) {
            await tunnelManager.stopTunnel(boundTunnelId, 'manual');
          }
          ws.close();
          break;
        }

        default:
          logger.debug('Unhandled message type', { type: msg.type });
      }
    } catch (err: any) {
      logger.error('Error handling WebSocket message', { error: err.message, stack: err.stack });
    }
  });

  ws.on('close', async () => {
    clearInterval(pingInterval);
    if (boundTunnelId) {
      await tunnelManager.handleClientDisconnect(boundTunnelId, ws);
    }
    logger.info('Client WebSocket closed', { clientIp, tunnelId: boundTunnelId });
  });

  ws.on('error', (err) => {
    logger.error('Client WebSocket error', { error: err.message, tunnelId: boundTunnelId });
  });
}
