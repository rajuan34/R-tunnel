import { Request, Response, NextFunction } from 'express';
import { tunnelStore } from '../tunnels/tunnel.store.js';
import { tunnelManager } from '../tunnels/tunnel.manager.js';
import { config } from '../config.js';
import { logger } from '../logging/logger.js';
import { generateRequestId } from '../utils/crypto.js';
import { extractTunnelIdFromHost } from '../utils/helpers.js';
import { HttpRequestPayload, HttpResponsePayload } from '../websocket/protocol.js';
import { SimpleRateLimiter } from '../security/rate-limiter.js';
import { dashboardWsManager } from '../websocket/dashboard.ws.js';
import { ActivityLogEntry } from '../tunnels/tunnel.model.js';
import path from 'node:path';
import fs from 'node:fs';

const proxyLimiter = new SimpleRateLimiter(60000, config.maxRequestsPerMinute);

// Hop-by-hop headers to strip
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function renderErrorPage(res: Response, statusCode: number, title: string, message: string, reasonDetails?: string): void {
  const acceptsHtml = res.req.accepts('html');
  if (!acceptsHtml) {
    res.status(statusCode).json({
      error: title,
      message,
      statusCode,
      details: reasonDetails,
    });
    return;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusCode} - ${title} | R-Tunnel</title>
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; max-width: 520px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
    .badge-error { background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .badge-expired { background: rgba(210, 153, 34, 0.15); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
    h1 { margin: 0 0 12px 0; font-size: 24px; color: #f0f6fc; font-weight: 600; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #8b949e; font-size: 14px; }
    .details { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-family: monospace; font-size: 13px; color: #79c0ff; }
    .btn { display: inline-block; background: #238636; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 12px; }
    .btn:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge ${statusCode === 410 ? 'badge-expired' : 'badge-error'}">${statusCode} ${statusCode === 410 ? 'EXPIRED' : 'ERROR'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${reasonDetails ? `<div class="details">${reasonDetails}</div>` : ''}
    <p style="font-size: 12px; color: #6e7681; margin-top: 20px;">
      Powered by <strong>R-Tunnel</strong> — Temporary HTTP/HTTPS Tunneling Service
    </p>
    <a href="/dashboard" class="btn">Go to Dashboard</a>
  </div>
</body>
</html>`;

  res.status(statusCode).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
}

export async function handleTunnelProxy(
  req: Request,
  res: Response,
  tunnelId: string,
  targetPath: string
): Promise<void> {
  const startTime = Date.now();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';

  // 1. Rate limiting
  const rateKey = `proxy:${clientIp}:${tunnelId}`;
  const rateCheck = proxyLimiter.isAllowed(rateKey);
  if (!rateCheck.allowed) {
    renderErrorPage(
      res,
      429,
      'Rate Limit Exceeded',
      'This tunnel has received too many requests in a short period. Please try again shortly.',
      `Max requests: ${config.maxRequestsPerMinute}/min`
    );
    return;
  }

  // 2. Fetch tunnel
  const tunnel = await tunnelStore.get(tunnelId);
  if (!tunnel) {
    renderErrorPage(
      res,
      404,
      'Tunnel Not Found',
      'The requested tunnel ID does not exist on this server. Check your URL or create a new tunnel.',
      `Tunnel ID: ${tunnelId}`
    );
    return;
  }

  // 3. Expiration check
  if (tunnel.status === 'expired' || Date.now() >= tunnel.expiresAt) {
    renderErrorPage(
      res,
      410,
      'Tunnel Expired',
      'This tunnel is no longer active. It has reached its expiration time or was closed by the user.',
      'Possible reasons: duration expired, client disconnected, or manual stop.'
    );
    return;
  }

  // 4. Client connectivity check
  if (!tunnelManager.isClientConnected(tunnelId)) {
    renderErrorPage(
      res,
      502,
      'Tunnel Offline',
      'The Termux client for this tunnel is currently disconnected. Make sure the rtunnel command is running on your Android device.',
      `Target: 127.0.0.1:${tunnel.localPort}`
    );
    return;
  }

  // 5. Check request body size
  const contentLength = parseInt((req.headers['content-length'] as string) || '0', 10);
  if (contentLength > config.maxBodySize) {
    renderErrorPage(
      res,
      413,
      'Payload Too Large',
      `Request body exceeds the maximum permitted size of ${Math.round(config.maxBodySize / (1024 * 1024))}MB.`,
      `Size: ${contentLength} bytes (Max: ${config.maxBodySize} bytes)`
    );
    return;
  }

  // 6. Read and buffer body if present
  let bodyBuffer: Buffer | null = null;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    try {
      bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > config.maxBodySize) {
            reject(new Error('Payload too large'));
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
      });
    } catch (err) {
      renderErrorPage(res, 413, 'Payload Too Large', 'Request body exceeded maximum allowed size.');
      return;
    }
  }

  // Clean headers (remove hop-by-hop and host rewriting)
  const forwardHeaders: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && lower !== 'host') {
      forwardHeaders[k] = v;
    }
  }
  forwardHeaders['host'] = `127.0.0.1:${tunnel.localPort}`;
  forwardHeaders['x-forwarded-for'] = clientIp;
  forwardHeaders['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  forwardHeaders['x-tunnel-id'] = tunnelId;

  // Prepare payload
  const requestId = generateRequestId();
  const isBinaryRequest = Boolean(bodyBuffer && bodyBuffer.length > 0);
  const reqPayload: HttpRequestPayload = {
    requestId,
    method: req.method,
    path: targetPath || '/',
    query: req.query as Record<string, string | string[]>,
    headers: forwardHeaders,
    body: bodyBuffer ? bodyBuffer.toString('base64') : undefined,
    isBase64: isBinaryRequest,
  };

  try {
    const responsePayload: HttpResponsePayload = await tunnelManager.dispatchHttpRequest(
      tunnelId,
      reqPayload,
      config.requestTimeoutMs
    );

    const latencyMs = Date.now() - startTime;

    // Set response status
    res.status(responsePayload.statusCode || 200);

    // Apply headers from client response
    let responseSizeBytes = 0;
    if (responsePayload.headers) {
      for (const [key, value] of Object.entries(responsePayload.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }
    }

    // Set security / tunnel headers
    res.setHeader('X-Tunnel-Id', tunnelId);
    res.setHeader('X-Tunnel-Latency', `${latencyMs}ms`);

    // Write body
    if (responsePayload.body) {
      if (responsePayload.isBase64) {
        const buf = Buffer.from(responsePayload.body, 'base64');
        responseSizeBytes = buf.length;
        res.end(buf);
      } else {
        responseSizeBytes = Buffer.byteLength(responsePayload.body, 'utf-8');
        res.end(responsePayload.body);
      }
    } else {
      res.end();
    }

    // Record activity log
    const activityEntry: ActivityLogEntry = {
      id: requestId,
      timestamp: Date.now(),
      tunnelId,
      method: req.method,
      path: targetPath || '/',
      statusCode: responsePayload.statusCode || 200,
      latencyMs,
      requestSizeBytes: bodyBuffer ? bodyBuffer.length : 0,
      responseSizeBytes,
      clientIp,
    };

    await tunnelStore.recordActivity(activityEntry);
    dashboardWsManager.broadcast('activity_logged', activityEntry);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    logger.warn('Error proxying request to tunnel', {
      tunnelId,
      path: targetPath,
      error: err.message,
    });

    renderErrorPage(
      res,
      504,
      'Gateway Timeout',
      `Error communicating with local server: ${err.message}`,
      `Request ID: ${requestId}`
    );
  }
}

/**
 * Express middleware to intercept subdomain tunnels or path-based tunnels
 */
export async function proxyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.headers.host || '';

  // 1. Check subdomain mode (e.g. x7k29m4p.example.com)
  const subdomainTunnelId = extractTunnelIdFromHost(host);
  if (subdomainTunnelId) {
    await handleTunnelProxy(req, res, subdomainTunnelId, req.url);
    return;
  }

  // 2. Check path-based mode (/t/:tunnelId/*)
  const pathMatch = req.url.match(/^\/t\/([a-z0-9]{6,32})(\/.*)?$/i);
  if (pathMatch) {
    const tunnelId = pathMatch[1].toLowerCase();
    const targetPath = pathMatch[2] || '/';
    await handleTunnelProxy(req, res, tunnelId, targetPath);
    return;
  }

  // Not a tunnel proxy request, pass to next handlers
  next();
}
