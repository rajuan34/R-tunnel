import { Router, Request, Response } from 'express';
import { tunnelStore } from '../tunnels/tunnel.store.js';
import { tunnelManager } from '../tunnels/tunnel.manager.js';
import { authService } from '../auth/auth.service.js';
import { requireAdminAuth, requireCsrf, adminLoginRateLimit } from '../auth/auth.middleware.js';
import { config } from '../config.js';
import { buildPublicUrl } from '../utils/helpers.js';
import { logger } from '../logging/logger.js';

export const apiRouter = Router();

/**
 * Health check endpoint (for Render and uptime monitors)
 * GET /health
 */
apiRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Admin Login
 * POST /api/auth/login
 */
apiRouter.post('/api/auth/login', adminLoginRateLimit, async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const isValid = await authService.verifyAdmin(username, password);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const session = authService.createSession(username);

  // Set secure HTTP-only cookie
  res.cookie('rt_session', session.token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    user: { username: session.username },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
});

/**
 * Admin Logout
 * POST /api/auth/logout
 */
apiRouter.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = req.cookies?.rt_session;
  if (token) {
    authService.destroySession(token);
  }
  res.clearCookie('rt_session');
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Current Admin Session info
 * GET /api/auth/me
 */
apiRouter.get('/api/auth/me', (req: Request, res: Response) => {
  let token = req.cookies?.rt_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  const session = authService.validateSession(token);
  if (!session) {
    res.clearCookie('rt_session');
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: { username: session.username },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
});

// All routes below require admin authentication
apiRouter.use('/api', requireAdminAuth);

/**
 * Get all tunnels
 * GET /api/tunnels
 */
apiRouter.get('/api/tunnels', async (req: Request, res: Response) => {
  const tunnels = await tunnelStore.getAll();
  // Sort descending by created time
  tunnels.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ tunnels });
});

/**
 * Create a new tunnel from Dashboard
 * POST /api/tunnels
 */
apiRouter.post('/api/tunnels', requireCsrf, async (req: Request, res: Response) => {
  const { port, duration, label } = req.body || {};
  const localPort = parseInt(port, 10);

  if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
    res.status(400).json({ error: 'Port must be a valid integer between 1 and 65535' });
    return;
  }

  let durationSeconds = config.defaultTunnelDuration;
  if (duration) {
    const parsed = parseInt(duration, 10);
    if (!isNaN(parsed) && parsed > 0) {
      durationSeconds = parsed;
    }
  }

  const { tunnel, error } = await tunnelManager.createTunnel({
    port: localPort,
    durationSeconds,
    label: label?.trim() || `Port ${localPort}`,
    clientIp: req.ip,
  });

  if (error || !tunnel) {
    res.status(400).json({ error: error || 'Failed to create tunnel' });
    return;
  }

  // Generate an ephemeral client token for this tunnel so the user doesn't have to leak master token
  const clientToken = authService.createEphemeralClientToken(durationSeconds * 2, `tunnel-${tunnel.id}`);

  // Base URL for the command
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const serverUrl = config.publicBaseUrl || `${proto}://${host}`;

  const cliCommand = `rtunnel create --server "${serverUrl}" --token "${clientToken}" --port ${tunnel.localPort} --id ${tunnel.id}`;

  res.status(201).json({
    tunnel,
    clientToken,
    cliCommand,
  });
});

/**
 * Get specific tunnel details
 * GET /api/tunnels/:id
 */
apiRouter.get('/api/tunnels/:id', async (req: Request, res: Response) => {
  const tunnel = await tunnelStore.get(req.params.id);
  if (!tunnel) {
    res.status(404).json({ error: 'Tunnel not found' });
    return;
  }
  res.json({ tunnel });
});

/**
 * Delete / Stop tunnel
 * DELETE /api/tunnels/:id
 */
apiRouter.delete('/api/tunnels/:id', requireCsrf, async (req: Request, res: Response) => {
  const success = await tunnelManager.stopTunnel(req.params.id, 'manual');
  if (!success) {
    res.status(404).json({ error: 'Tunnel not found or already stopped' });
    return;
  }
  res.json({ success: true, message: 'Tunnel stopped successfully' });
});

/**
 * Stop tunnel
 * POST /api/tunnels/:id/stop
 */
apiRouter.post('/api/tunnels/:id/stop', requireCsrf, async (req: Request, res: Response) => {
  const success = await tunnelManager.stopTunnel(req.params.id, 'manual');
  if (!success) {
    res.status(404).json({ error: 'Tunnel not found or already stopped' });
    return;
  }
  res.json({ success: true, message: 'Tunnel stopped' });
});

/**
 * Extend tunnel duration
 * POST /api/tunnels/:id/extend
 */
apiRouter.post('/api/tunnels/:id/extend', requireCsrf, async (req: Request, res: Response) => {
  const { seconds } = req.body || {};
  const addSeconds = parseInt(seconds, 10);

  if (isNaN(addSeconds) || addSeconds <= 0) {
    res.status(400).json({ error: 'Invalid extension duration' });
    return;
  }

  const result = await tunnelManager.extendTunnel(req.params.id, addSeconds);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, tunnel: result.tunnel });
});

/**
 * Get system statistics
 * GET /api/stats
 */
apiRouter.get('/api/stats', async (req: Request, res: Response) => {
  const stats = await tunnelManager.getSystemStats();
  res.json(stats);
});

/**
 * Get request activity log
 * GET /api/activity
 */
apiRouter.get('/api/activity', async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const activity = await tunnelStore.getActivity(Math.min(limit, 200));
  res.json({ activity });
});

/**
 * Generate ephemeral client token for CLI command
 * POST /api/tokens/generate
 */
apiRouter.post('/api/tokens/generate', requireCsrf, async (req: Request, res: Response) => {
  const { durationSeconds = 86400, label } = req.body || {};
  const token = authService.createEphemeralClientToken(durationSeconds, label);
  res.json({ token, expiresAt: Date.now() + durationSeconds * 1000 });
});
