import { Router, Request, Response } from 'express';
import { tunnelStore } from '../tunnels/tunnel.store.js';
import { tunnelManager } from '../tunnels/tunnel.manager.js';
import { authService } from '../auth/auth.service.js';
import { userService } from '../auth/user.service.js';
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
 * Admin / User Login
 * POST /api/auth/login
 */
apiRouter.post('/api/auth/login', adminLoginRateLimit, async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password / master key are required' });
    return;
  }

  const authResult = await authService.verifyAdmin(username, password);
  if (!authResult.valid) {
    res.status(401).json({ error: 'Invalid username or password/master key' });
    return;
  }

  const role = authResult.user?.role || 'admin';
  const userId = authResult.user?.id;
  const session = authService.createSession(username, role, userId);

  // Set secure HTTP-only cookie with sameSite=none for cross-origin iframes
  res.cookie('rt_session', session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    token: session.token,
    user: {
      username: session.username,
      role: session.role || 'admin',
      userId: session.userId,
    },
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
 * Current Session info
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
    user: {
      username: session.username,
      role: session.role || 'admin',
      userId: session.userId,
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
});

/**
 * Public system statistics (safe for landing page)
 * GET /api/public-stats
 */
apiRouter.get('/api/public-stats', async (req: Request, res: Response) => {
  try {
    const stats = await tunnelManager.getSystemStats();
    const userStats = userService.getUserStats();
    res.json({
      activeTunnels: stats.activeTunnels,
      totalRequests: stats.totalRequests,
      totalBytes: stats.totalBytesIn + stats.totalBytesOut,
      connectedClients: stats.connectedClients,
      registeredUsers: userStats.total,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (e) {
    res.json({
      activeTunnels: 0,
      totalRequests: 0,
      totalBytes: 0,
      connectedClients: 0,
      registeredUsers: 0,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }
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

/**
 * List active ephemeral client tokens
 * GET /api/tokens
 */
apiRouter.get('/api/tokens', (req: Request, res: Response) => {
  const tokens = authService.listClientTokens();
  res.json({ tokens });
});

/**
 * Revoke client token
 * DELETE /api/tokens/:token
 */
apiRouter.delete('/api/tokens/:token', requireCsrf, (req: Request, res: Response) => {
  const success = authService.revokeClientToken(req.params.token);
  if (!success) {
    res.status(404).json({ error: 'Token not found or already expired' });
    return;
  }
  res.json({ success: true, message: 'Token revoked' });
});

// ==========================================
// USER & MASTER KEY MANAGEMENT ENDPOINTS
// ==========================================

/**
 * List all managed users with active tunnel counts
 * GET /api/users
 */
apiRouter.get('/api/users', async (req: Request, res: Response) => {
  const users = userService.getAllUsers();
  const activeTunnels = await tunnelStore.getActive();

  // Map active tunnel count per user
  const userListWithCounts = users.map((u) => {
    const activeCount = activeTunnels.filter((t) => t.userId === u.id).length;
    return {
      ...u,
      activeTunnelsCount: activeCount,
    };
  });

  const stats = userService.getUserStats();
  res.json({
    users: userListWithCounts,
    stats,
  });
});

/**
 * Create a new user and generate/assign Master Key
 * POST /api/users
 */
apiRouter.post('/api/users', requireCsrf, async (req: Request, res: Response) => {
  const {
    username,
    displayName,
    email,
    note,
    masterKey,
    role = 'user',
    status = 'active',
    maxTunnels = 5,
    expiresInDays,
  } = req.body || {};

  const { user, error } = userService.createUser({
    username,
    displayName,
    email,
    note,
    masterKey,
    role,
    status,
    maxTunnels: parseInt(maxTunnels, 10),
    expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
  });

  if (error || !user) {
    res.status(400).json({ error: error || 'Failed to create user' });
    return;
  }

  // Base URL for the setup commands
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const serverUrl = config.publicBaseUrl || `${proto}://${host}`;

  const cliLoginCommand = `rtunnel login --server "${serverUrl}" --token "${user.masterKey}"`;
  const cliCreateCommand = `rtunnel 8080 --server "${serverUrl}" --token "${user.masterKey}"`;

  res.status(201).json({
    user: {
      ...user,
      activeTunnelsCount: 0,
    },
    cliLoginCommand,
    cliCreateCommand,
  });
});

/**
 * Get specific user details and their active tunnels
 * GET /api/users/:id
 */
apiRouter.get('/api/users/:id', async (req: Request, res: Response) => {
  const user = userService.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const activeTunnels = await tunnelStore.getActive();
  const userTunnels = activeTunnels.filter((t) => t.userId === user.id);

  res.json({
    user: {
      ...user,
      activeTunnelsCount: userTunnels.length,
    },
    tunnels: userTunnels,
  });
});

/**
 * Update user details
 * PUT /api/users/:id
 */
apiRouter.put('/api/users/:id', requireCsrf, async (req: Request, res: Response) => {
  const { displayName, email, note, role, status, maxTunnels, expiresAt } = req.body || {};

  const { user, error } = userService.updateUser(req.params.id, {
    displayName,
    email,
    note,
    role,
    status,
    maxTunnels: typeof maxTunnels === 'number' ? maxTunnels : undefined,
    expiresAt,
  });

  if (error || !user) {
    res.status(400).json({ error: error || 'Failed to update user' });
    return;
  }

  // If user was suspended, immediately terminate their active tunnels
  if (user.status === 'suspended') {
    await tunnelManager.stopTunnelsForUser(user.id, 'manual');
  }

  const activeTunnels = await tunnelStore.getActive();
  const activeCount = activeTunnels.filter((t) => t.userId === user.id).length;

  res.json({
    user: {
      ...user,
      activeTunnelsCount: activeCount,
    },
  });
});

/**
 * Regenerate Master Key for user
 * POST /api/users/:id/regenerate-key
 */
apiRouter.post('/api/users/:id/regenerate-key', requireCsrf, async (req: Request, res: Response) => {
  const { customKey } = req.body || {};
  const { user, newMasterKey, error } = userService.regenerateMasterKey(req.params.id, customKey);

  if (error || !user) {
    res.status(400).json({ error: error || 'Failed to regenerate Master Key' });
    return;
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const serverUrl = config.publicBaseUrl || `${proto}://${host}`;

  const cliLoginCommand = `rtunnel login --server "${serverUrl}" --token "${newMasterKey}"`;
  const cliCreateCommand = `rtunnel 8080 --server "${serverUrl}" --token "${newMasterKey}"`;

  res.json({
    user,
    newMasterKey,
    cliLoginCommand,
    cliCreateCommand,
  });
});

/**
 * Toggle user status (active <-> suspended)
 * POST /api/users/:id/toggle-status
 */
apiRouter.post('/api/users/:id/toggle-status', requireCsrf, async (req: Request, res: Response) => {
  const user = userService.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newStatus = user.status === 'active' ? 'suspended' : 'active';
  const { user: updatedUser } = userService.updateUser(user.id, { status: newStatus });

  if (newStatus === 'suspended') {
    await tunnelManager.stopTunnelsForUser(user.id, 'manual');
  }

  res.json({
    user: updatedUser,
  });
});

/**
 * Delete user and terminate their tunnels
 * DELETE /api/users/:id
 */
apiRouter.delete('/api/users/:id', requireCsrf, async (req: Request, res: Response) => {
  const user = userService.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Stop active tunnels
  await tunnelManager.stopTunnelsForUser(user.id, 'manual');

  // Delete from user service
  const { success } = userService.deleteUser(user.id);
  if (!success) {
    res.status(400).json({ error: 'Failed to delete user' });
    return;
  }

  res.json({
    success: true,
    message: `User ${user.username} deleted and active tunnels closed`,
  });
});

