import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logging/logger.js';
import { proxyMiddleware } from './http/proxy.router.js';
import { apiRouter } from './http/api.router.js';
import { handleClientWebSocketConnection } from './websocket/client.ws.js';
import { dashboardWsManager } from './websocket/dashboard.ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate web directory across dev (source), bundle, or container paths
function resolveWebDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'web'),
    path.resolve(__dirname, '../../web'),
    path.resolve(__dirname, '../web'),
    path.resolve(__dirname, 'web'),
    '/app/applet/web',
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), 'web');
}

const webDir = resolveWebDir();

const app = express();
const server = http.createServer(app);

// 1. Trust proxy headers (essential on Render and Cloud Run)
app.set('trust proxy', true);

// 2. Global Security Headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // For dev/iframe in AI Studio, allow framing, or SAMEORIGIN
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 3. CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// 4. CRITICAL: Proxy Middleware MUST run BEFORE express.json() / urlencoded()
// so that streamed request bodies, binary payloads, and multipart forms can pass through untouched!
app.use(proxyMiddleware);

// 5. Standard body parsing & cookie parser for API and web routes
app.use(express.json({ limit: `${Math.round(config.maxBodySize / (1024 * 1024))}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${Math.round(config.maxBodySize / (1024 * 1024))}mb` }));
app.use(cookieParser());

// 6. Mount API routes
app.use(apiRouter);

// 7. Serve static web files
app.use(express.static(webDir, { index: false }));

// 8. Frontend page routing
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.get('/dashboard', (req: Request, res: Response) => {
  res.sendFile(path.join(webDir, 'dashboard.html'));
});

app.get('/login', (req: Request, res: Response) => {
  res.sendFile(path.join(webDir, 'login.html'));
});

app.get('/docs', (req: Request, res: Response) => {
  res.sendFile(path.join(webDir, 'docs.html'));
});

// 9. 404 handler for unrecognized routes
app.use((req: Request, res: Response) => {
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(webDir, 'error.html'));
  } else {
    res.status(404).json({ error: 'Not Found', path: req.path });
  }
});

// 10. Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled server error', { error: err.message, stack: err.stack });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error', message: config.isProduction ? undefined : err.message });
});

// 11. WebSocket Servers
const clientWss = new WebSocketServer({ noServer: true, maxPayload: config.maxWsMessageSize });
const dashboardWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/ws/client') {
    clientWss.handleUpgrade(req, socket, head, (ws) => {
      handleClientWebSocketConnection(ws, req);
    });
  } else if (pathname === '/ws/dashboard') {
    dashboardWss.handleUpgrade(req, socket, head, (ws) => {
      dashboardWsManager.handleConnection(ws, req);
    });
  } else {
    // Unknown WebSocket endpoint
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

// 12. Start Server
server.listen(config.port, config.host, () => {
  logger.info(`R-Tunnel server started on http://${config.host}:${config.port}`, {
    env: config.env,
    publicBaseUrl: config.publicBaseUrl || `http://localhost:${config.port}`,
    publicBaseDomain: config.publicBaseDomain || '(path-based fallback)',
    maxActiveTunnels: config.maxActiveTunnels,
  });
});

// 13. Graceful Shutdown
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP & WebSocket servers closed.');
    process.exit(0);
  });
  // Force exit after 10s if stuck
  setTimeout(() => {
    logger.error('Forceful shutdown timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
