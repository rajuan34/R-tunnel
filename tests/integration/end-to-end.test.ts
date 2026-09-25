import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import express, { Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { proxyMiddleware } from '../../server/src/http/proxy.router.js';
import { apiRouter } from '../../server/src/http/api.router.js';
import { handleClientWebSocketConnection } from '../../server/src/websocket/client.ws.js';
import { authService } from '../../server/src/auth/auth.service.js';
import { tunnelStore } from '../../server/src/tunnels/tunnel.store.js';
import { tunnelManager } from '../../server/src/tunnels/tunnel.manager.js';
import { TunnelClient } from '../../client/src/websocket.js';
import { config } from '../../server/src/config.js';

describe('R-Tunnel End-to-End Integration Suite', () => {
  let localServer: http.Server;
  let localPort: number;

  let tunnelServer: http.Server;
  let tunnelServerPort: number;

  let client: TunnelClient;
  let clientTunnelId: string;
  const testMasterToken = 'test-secret-master-token-12345';

  // 1x1 transparent PNG buffer for binary integrity testing
  const SAMPLE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  before(async () => {
    // Override master token in auth service for tests
    config.tunnelMasterToken = testMasterToken;

    // 1. Start Local Mock Server (representing Termux localhost)
    localServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from Termux local server!');
        return;
      }

      if (url.pathname === '/query') {
        const queryObj: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (queryObj[k] = v));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(queryObj));
        return;
      }

      if (url.pathname === '/api/echo') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Custom-Echo': (req.headers['x-custom-header'] as string) || 'none',
          });
          res.end(
            JSON.stringify({
              method: req.method,
              body: body ? JSON.parse(body) : null,
              headers: req.headers,
            })
          );
        });
        return;
      }

      if (url.pathname === '/methods') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method }));
        return;
      }

      if (url.pathname === '/binary/image.png') {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': String(SAMPLE_PNG.length),
        });
        res.end(SAMPLE_PNG);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      localServer.listen(0, '127.0.0.1', () => {
        localPort = (localServer.address() as AddressInfo).port;
        resolve();
      });
    });

    // 2. Start R-Tunnel Server
    const app = express();
    tunnelServer = http.createServer(app);

    app.use(proxyMiddleware);
    app.use(express.json());
    app.use(cookieParser());
    app.use(apiRouter);

    const wss = new WebSocketServer({ noServer: true });
    tunnelServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (url.pathname === '/ws/client') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          handleClientWebSocketConnection(ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    await new Promise<void>((resolve) => {
      tunnelServer.listen(0, '127.0.0.1', () => {
        tunnelServerPort = (tunnelServer.address() as AddressInfo).port;
        resolve();
      });
    });

    // 3. Connect Termux Tunnel Client
    client = new TunnelClient({
      serverUrl: `http://127.0.0.1:${tunnelServerPort}`,
      token: testMasterToken,
      localPort: localPort,
      durationSeconds: 3600,
      label: 'Integration Test Tunnel',
      exitOnExpire: false,
      handleSignals: false,
    });

    client.start();

    // Wait until tunnel is registered in store
    await new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(async () => {
        const active = await tunnelStore.getActive();
        if (active.length > 0) {
          clearInterval(interval);
          clientTunnelId = active[0].id;
          resolve();
        } else if (attempts++ > 30) {
          clearInterval(interval);
          reject(new Error('Tunnel did not activate within timeout'));
        }
      }, 100);
    });
  });

  // Helper to make HTTP request to tunnel
  function makeTunnelRequest(
    path: string,
    options: http.RequestOptions = {},
    body?: string | Buffer
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const opts: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: tunnelServerPort,
        path: `/t/${clientTunnelId}${path}`,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = http.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  test('GET / returns 200 OK from local server', async () => {
    const res = await makeTunnelRequest('/');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.toString('utf-8'), 'Hello from Termux local server!');
    assert.strictEqual(res.headers['x-tunnel-id'], clientTunnelId);
  });

  test('Query strings are preserved accurately', async () => {
    const res = await makeTunnelRequest('/query?greeting=hello&name=termux');
    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.body.toString('utf-8'));
    assert.deepStrictEqual(parsed, { greeting: 'hello', name: 'termux' });
  });

  test('POST with JSON body and custom headers', async () => {
    const payload = JSON.stringify({ action: 'test_post', count: 123 });
    const res = await makeTunnelRequest(
      '/api/echo',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'VerifiedHeaderValue',
        },
      },
      payload
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-custom-echo'], 'VerifiedHeaderValue');

    const echoed = JSON.parse(res.body.toString('utf-8'));
    assert.strictEqual(echoed.method, 'POST');
    assert.deepStrictEqual(echoed.body, { action: 'test_post', count: 123 });
  });

  test('Supports PUT, PATCH, and DELETE methods', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await makeTunnelRequest('/methods', { method });
      assert.strictEqual(res.statusCode, 200);
      const parsed = JSON.parse(res.body.toString('utf-8'));
      assert.strictEqual(parsed.method, method);
    }
  });

  test('Binary response integrity is preserved (PNG buffer)', async () => {
    const res = await makeTunnelRequest('/binary/image.png');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'image/png');
    assert.strictEqual(res.body.length, SAMPLE_PNG.length);
    assert.ok(res.body.equals(SAMPLE_PNG), 'Binary payload was corrupted');
  });

  test('Handles concurrent HTTP requests without race conditions', async () => {
    const requests = Array.from({ length: 8 }, (_, i) =>
      makeTunnelRequest(`/query?reqIndex=${i}`).then((res) => {
        assert.strictEqual(res.statusCode, 200);
        const parsed = JSON.parse(res.body.toString('utf-8'));
        assert.strictEqual(parsed.reqIndex, String(i));
      })
    );
    await Promise.all(requests);
  });

  test('Returns 404 for unknown tunnel ID', async () => {
    const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${tunnelServerPort}/t/unknown999/`, (res) => {
          resolve({ statusCode: res.statusCode || 0 });
        })
        .on('error', reject);
    });

    assert.strictEqual(res.statusCode, 404);
  });

  test('Returns 410 for expired tunnel', async () => {
    // Manually stop tunnel
    await tunnelManager.stopTunnel(clientTunnelId, 'manual');

    const res = await makeTunnelRequest('/');
    assert.strictEqual(res.statusCode, 410);
  });

  after(async () => {
    if (clientTunnelId) {
      await tunnelManager.stopTunnel(clientTunnelId, 'manual');
    }
    localServer.close();
    tunnelServer.close();
  });
});
