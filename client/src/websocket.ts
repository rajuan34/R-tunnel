import { WebSocket } from 'ws';
import {
  parseMessage,
  serializeMessage,
  createMessage,
  ClientHelloPayload,
  ServerHelloPayload,
  CreateTunnelPayload,
  TunnelCreatedPayload,
  HttpRequestPayload,
  HttpResponsePayload,
  TunnelExpiringPayload,
  TunnelExpiredPayload,
  ErrorPayload,
} from '../../server/src/websocket/protocol.js';
import { forwardToLocalServer } from './proxy.js';

export interface TunnelClientOptions {
  serverUrl: string;
  token: string;
  localPort: number;
  durationSeconds?: number;
  label?: string;
  customTunnelId?: string;
  exitOnExpire?: boolean;
  handleSignals?: boolean;
}

export class TunnelClient {
  private options: TunnelClientOptions;
  private ws: WebSocket | null = null;
  private isStopping = false;
  private isExpired = false;
  private reconnectAttempts = 0;
  private backoffDelays = [1000, 2000, 4000, 8000, 16000, 30000];
  private currentTunnelId: string | null = null;
  private publicUrl: string | null = null;
  private expiresAt: number | null = null;
  private requestCount = 0;
  private trafficBytes = 0;

  constructor(options: TunnelClientOptions) {
    this.options = {
      exitOnExpire: true,
      handleSignals: true,
      ...options,
    };
    if (options.customTunnelId) {
      this.currentTunnelId = options.customTunnelId;
    }
  }

  private getWsUrl(): string {
    const raw = this.options.serverUrl.trim().replace(/\/+$/, '');
    let wsBase = raw;
    if (raw.startsWith('https://')) {
      wsBase = raw.replace('https://', 'wss://');
    } else if (raw.startsWith('http://')) {
      wsBase = raw.replace('http://', 'ws://');
    } else if (!raw.startsWith('ws://') && !raw.startsWith('wss://')) {
      wsBase = `wss://${raw}`;
    }
    return `${wsBase}/ws/client`;
  }

  public async start(): Promise<void> {
    if (this.options.handleSignals !== false) {
      this.setupSignalHandlers();
    }
    await this.connect();
  }

  private setupSignalHandlers(): void {
    const cleanExit = async () => {
      if (this.isStopping) return;
      this.isStopping = true;
      console.log('\n\x1b[33mStopping tunnel gracefully...\x1b[0m');

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(serializeMessage(createMessage('disconnect', {}, this.currentTunnelId || undefined)));
          this.ws.close();
        } catch {}
      }

      console.log('\x1b[32m✔ Tunnel closed cleanly. Goodbye!\x1b[0m');
      process.exit(0);
    };

    process.on('SIGINT', cleanExit);
    process.on('SIGTERM', cleanExit);
  }

  private async connect(): Promise<void> {
    if (this.isStopping || this.isExpired) return;

    const wsUrl = this.getWsUrl();
    if (this.reconnectAttempts === 0) {
      console.log(`\n\x1b[36mConnecting to server:\x1b[0m ${this.options.serverUrl}`);

      // Render cold-start optimization: ping /health to wake up sleeping free tier instances
      if (this.options.serverUrl.includes('onrender.com')) {
        process.stdout.write('\x1b[90mChecking Render edge health (waking if sleeping)...\x1b[0m ');
        try {
          const healthUrl = `${this.options.serverUrl.replace(/\/+$/, '')}/health`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          const res = await fetch(healthUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            console.log('\x1b[32m✔ Awake\x1b[0m');
          } else {
            console.log('\x1b[33m(connecting)\x1b[0m');
          }
        } catch (e) {
          console.log('\x1b[33m(connecting)\x1b[0m');
        }
      }
    } else {
      console.log(`\x1b[33mAttempting reconnect (${this.reconnectAttempts})...\x1b[0m`);
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err: any) {
      console.error(`\x1b[31mConnection error:\x1b[0m ${err.message}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      // Send client_hello handshake
      const helloPayload: ClientHelloPayload = {
        token: this.options.token,
        clientVersion: '1.0.0',
      };
      this.ws?.send(serializeMessage(createMessage('client_hello', helloPayload)));
    });

    this.ws.on('message', async (data) => {
      const msg = parseMessage(data as any);
      if (!msg) return;

      switch (msg.type) {
        case 'ping': {
          this.ws?.send(serializeMessage(createMessage('pong', {}, this.currentTunnelId || undefined, msg.requestId)));
          break;
        }

        case 'server_hello': {
          // Authenticated! Now request/bind tunnel
          const createPayload: CreateTunnelPayload = {
            port: this.options.localPort,
            durationSeconds: this.options.durationSeconds,
            label: this.options.label,
            customTunnelId: this.currentTunnelId || undefined,
          };
          this.ws?.send(serializeMessage(createMessage('create_tunnel', createPayload, undefined, msg.requestId)));
          break;
        }

        case 'tunnel_created': {
          const payload = msg.payload as TunnelCreatedPayload;
          this.currentTunnelId = payload.tunnelId;
          this.publicUrl = payload.publicUrl;
          this.expiresAt = payload.expiresAt;

          this.printBanner();
          break;
        }

        case 'http_request': {
          const reqPayload = msg.payload as HttpRequestPayload;
          this.requestCount++;

          const resPayload = await forwardToLocalServer(reqPayload, this.options.localPort);
          if (resPayload.body) {
            this.trafficBytes += resPayload.isBase64
              ? Buffer.from(resPayload.body, 'base64').length
              : Buffer.byteLength(resPayload.body, 'utf-8');
          }

          // Send response back
          this.ws?.send(
            serializeMessage(
              createMessage<HttpResponsePayload>('http_response', resPayload, this.currentTunnelId || undefined, reqPayload.requestId)
            )
          );

          // Log to terminal
          this.printRequestLog(reqPayload.method, reqPayload.path, resPayload.statusCode, resPayload.durationMs || 0);
          break;
        }

        case 'tunnel_expiring': {
          const payload = msg.payload as TunnelExpiringPayload;
          const mins = Math.ceil(payload.remainingSeconds / 60);
          console.log(`\n\x1b[33m⚠ Warning: Tunnel will expire in ${mins} minute(s)!\x1b[0m`);
          break;
        }

        case 'tunnel_expired': {
          const payload = msg.payload as TunnelExpiredPayload;
          this.isExpired = true;
          console.log(`\n\x1b[31m✖ Tunnel Expired: ${payload.message}\x1b[0m`);
          this.ws?.close();
          if (this.options.exitOnExpire !== false) {
            process.exit(0);
          }
          break;
        }

        case 'error': {
          const payload = msg.payload as ErrorPayload;
          console.error(`\n\x1b[31m✖ Server Error [${payload.code}]: ${payload.message}\x1b[0m`);
          if (payload.code === 'UNAUTHORIZED') {
            console.error('\x1b[31mAuthentication failed. Please check your token or run rtunnel login.\x1b[0m');
            this.isStopping = true;
            this.ws?.close();
            process.exit(1);
          }
          break;
        }
      }
    });

    this.ws.on('close', (code, reason) => {
      if (this.isStopping || this.isExpired) return;

      if (code === 4001) {
        console.error('\x1b[31m✖ Disconnected: Unauthorized token.\x1b[0m');
        process.exit(1);
      }

      console.log(`\n\x1b[33mConnection lost (code: ${code}).\x1b[0m`);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      // WS error will trigger close event
    });
  }

  private scheduleReconnect(): void {
    if (this.isStopping || this.isExpired) return;

    const delayIndex = Math.min(this.reconnectAttempts, this.backoffDelays.length - 1);
    const baseDelay = this.backoffDelays[delayIndex];
    // Add 10-20% jitter
    const jitter = Math.floor(Math.random() * (baseDelay * 0.2));
    const delay = baseDelay + jitter;

    this.reconnectAttempts++;
    console.log(`Reconnecting in ${(delay / 1000).toFixed(1)}s...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private printBanner(): void {
    const durationMins = this.options.durationSeconds ? Math.round(this.options.durationSeconds / 60) : 60;
    const durationStr = durationMins >= 60 ? `${(durationMins / 60).toFixed(1)} hours` : `${durationMins} mins`;

    console.log('\n\x1b[1;35m==================================================\x1b[0m');
    console.log('\x1b[1;36m       R-Tunnel — Android Termux HTTP Tunnel       \x1b[0m');
    console.log('\x1b[1;35m==================================================\x1b[0m');
    console.log(`\x1b[32m✔ Server connected\x1b[0m`);
    console.log(`\x1b[32m✔ Authentication successful\x1b[0m`);
    console.log(`\x1b[32m✔ Tunnel active\x1b[0m\n`);

    console.log(`  \x1b[1mLocal:\x1b[0m       http://127.0.0.1:${this.options.localPort}`);
    console.log(`  \x1b[1mPublic:\x1b[0m      \x1b[32;1m${this.publicUrl}\x1b[0m`);
    console.log(`  \x1b[1mDuration:\x1b[0m    ${durationStr}`);
    console.log(`  \x1b[1mTunnel ID:\x1b[0m   \x1b[33m${this.currentTunnelId}\x1b[0m`);
    console.log(`  \x1b[1mStatus:\x1b[0m      \x1b[32mCONNECTED\x1b[0m\n`);
    console.log(`  \x1b[90mPress Ctrl+C to stop tunnel gracefully.\x1b[0m`);
    console.log('\x1b[1;35m--------------------------------------------------\x1b[0m');
    console.log('Live HTTP Requests:\n');
  }

  private printRequestLog(method: string, path: string, status: number, durationMs: number): void {
    let statusColor = '\x1b[32m'; // green 2xx
    if (status >= 300 && status < 400) statusColor = '\x1b[36m'; // cyan 3xx
    if (status >= 400 && status < 500) statusColor = '\x1b[33m'; // yellow 4xx
    if (status >= 500) statusColor = '\x1b[31m'; // red 5xx

    const methodPad = method.padEnd(7, ' ');
    const pathTrunc = (path.length > 35 ? path.substring(0, 32) + '...' : path).padEnd(36, ' ');
    const statusPad = `${statusColor}${status}\x1b[0m`;
    const durPad = `${durationMs}ms`.padStart(7, ' ');

    console.log(`  ${methodPad} ${pathTrunc} ${statusPad}  ${durPad}`);
  }
}
