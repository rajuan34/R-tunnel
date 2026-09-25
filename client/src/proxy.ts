import http from 'node:http';
import { HttpRequestPayload, HttpResponsePayload } from '../../server/src/websocket/protocol.js';

const FORBIDDEN_CLIENT_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const BINARY_CONTENT_TYPES = [
  'image/',
  'audio/',
  'video/',
  'font/',
  'application/octet-stream',
  'application/zip',
  'application/gzip',
  'application/pdf',
  'application/wasm',
];

function isBinaryContentType(contentType?: string): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return BINARY_CONTENT_TYPES.some((type) => lower.includes(type));
}

function hasBinaryBytes(buffer: Buffer): boolean {
  // Check for null bytes in buffer (typical indicator of binary data)
  for (let i = 0; i < Math.min(buffer.length, 512); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export function isValidLocalhost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

export async function forwardToLocalServer(
  reqPayload: HttpRequestPayload,
  localPort: number,
  localHost: string = '127.0.0.1'
): Promise<HttpResponsePayload> {
  const startTime = Date.now();

  // Strict SSRF enforcement: Only localhost allowed!
  if (!isValidLocalhost(localHost)) {
    return {
      requestId: reqPayload.requestId,
      statusCode: 403,
      headers: { 'content-type': 'text/plain' },
      body: 'SSRF Blocked: Tunnel client strictly forwards to localhost only.',
      isBase64: false,
      durationMs: Date.now() - startTime,
    };
  }

  return new Promise<HttpResponsePayload>((resolve) => {
    // Construct local request headers
    const reqHeaders: Record<string, string | string[] | undefined> = {};
    if (reqPayload.headers) {
      for (const [key, val] of Object.entries(reqPayload.headers)) {
        if (!FORBIDDEN_CLIENT_HEADERS.has(key.toLowerCase())) {
          reqHeaders[key] = val;
        }
      }
    }

    reqHeaders['host'] = `${localHost}:${localPort}`;

    let reqBodyBuffer: Buffer | null = null;
    if (reqPayload.body) {
      reqBodyBuffer = reqPayload.isBase64
        ? Buffer.from(reqPayload.body, 'base64')
        : Buffer.from(reqPayload.body, 'utf-8');
      reqHeaders['content-length'] = String(reqBodyBuffer.length);
    }

    const options: http.RequestOptions = {
      hostname: localHost,
      port: localPort,
      path: reqPayload.path,
      method: reqPayload.method,
      headers: reqHeaders,
      timeout: 25000,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] as string | undefined;
        const isBinary = isBinaryContentType(contentType) || hasBinaryBytes(fullBuffer);

        const resHeaders: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (!FORBIDDEN_CLIENT_HEADERS.has(k.toLowerCase())) {
            resHeaders[k] = v;
          }
        }

        resolve({
          requestId: reqPayload.requestId,
          statusCode: res.statusCode || 200,
          headers: resHeaders,
          body: isBinary ? fullBuffer.toString('base64') : fullBuffer.toString('utf-8'),
          isBase64: isBinary,
          durationMs: Date.now() - startTime,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        requestId: reqPayload.requestId,
        statusCode: 504,
        headers: { 'content-type': 'text/plain' },
        body: `Local server (127.0.0.1:${localPort}) timed out.`,
        isBase64: false,
        durationMs: Date.now() - startTime,
      });
    });

    req.on('error', (err: any) => {
      resolve({
        requestId: reqPayload.requestId,
        statusCode: 502,
        headers: { 'content-type': 'text/plain' },
        body: `Local connection error to 127.0.0.1:${localPort}: ${err.message}`,
        isBase64: false,
        durationMs: Date.now() - startTime,
      });
    });

    if (reqBodyBuffer) {
      req.write(reqBodyBuffer);
    }
    req.end();
  });
}
