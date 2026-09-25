import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'node:http';
import { logger } from '../logging/logger.js';

export class DashboardWsManager {
  private clients = new Set<WebSocket>();

  handleConnection(ws: WebSocket, req: IncomingMessage): void {
    this.clients.add(ws);
    logger.debug('Dashboard client connected', { total: this.clients.size });

    // Send initial ping to keep alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25000);

    ws.on('close', () => {
      clearInterval(pingInterval);
      this.clients.delete(ws);
      logger.debug('Dashboard client disconnected', { total: this.clients.size });
    });

    ws.on('error', (err) => {
      logger.warn('Dashboard WS error', { error: err.message });
      clearInterval(pingInterval);
      this.clients.delete(ws);
    });
  }

  broadcast(event: string, data: any): void {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          logger.warn('Failed to send to dashboard client', { err });
        }
      }
    }
  }

  getConnectedCount(): number {
    return this.clients.size;
  }
}

export const dashboardWsManager = new DashboardWsManager();
