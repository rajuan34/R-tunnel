import { Request, Response, NextFunction } from 'express';
import { authService, AdminSession } from './auth.service.js';
import { SimpleRateLimiter } from '../security/rate-limiter.js';

// Extend Express Request to include session
declare global {
  namespace Express {
    interface Request {
      adminSession?: AdminSession;
    }
  }
}

const loginLimiter = new SimpleRateLimiter(60000, 10); // 10 attempts per minute

export function adminLoginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const check = loginLimiter.isAllowed(`login:${ip}`);
  if (!check.allowed) {
    res.status(429).json({
      error: 'Too many login attempts. Please wait a minute and try again.',
      resetAt: check.resetAt,
    });
    return;
  }
  next();
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.rt_session;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized. Authentication session required.' });
    return;
  }

  const session = authService.validateSession(token);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized. Session expired or invalid.' });
    return;
  }

  req.adminSession = session;
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method.toUpperCase())) {
    return next();
  }

  const session = req.adminSession;
  if (!session) {
    res.status(403).json({ error: 'CSRF validation failed: No session.' });
    return;
  }

  const clientCsrf = req.headers['x-csrf-token'];
  if (!clientCsrf || clientCsrf !== session.csrfToken) {
    res.status(403).json({ error: 'CSRF token missing or mismatch.' });
    return;
  }

  next();
}
