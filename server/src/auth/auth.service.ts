import { config } from '../config.js';
import { verifyPassword, hashPassword, generateSecureToken, timingSafeEqual } from '../utils/crypto.js';
import { logger } from '../logging/logger.js';

export interface AdminSession {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
}

export interface ClientTokenInfo {
  token: string;
  label?: string;
  createdAt: number;
  expiresAt: number;
  maxTunnels?: number;
}

export class AuthService {
  private sessions = new Map<string, AdminSession>();
  private clientTokens = new Map<string, ClientTokenInfo>();
  private sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Clean up expired sessions periodically
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * Verify admin credentials.
   */
  async verifyAdmin(username: string, passwordPlain: string): Promise<boolean> {
    if (!username || !passwordPlain) return false;
    if (username !== config.adminUsername) return false;

    // 1. If ADMIN_PASSWORD (plaintext) is provided, verify using timing-safe comparison
    if (config.adminPassword) {
      return timingSafeEqual(passwordPlain, config.adminPassword);
    }

    // 2. If ADMIN_PASSWORD_HASH is set, verify against bcrypt hash
    if (config.adminPasswordHash) {
      try {
        return await verifyPassword(passwordPlain, config.adminPasswordHash);
      } catch (err) {
        logger.error('Error verifying admin password hash', { err });
        return false;
      }
    }

    // 3. Fallback in development mode: allow admin/admin with warning
    if (!config.isProduction) {
      logger.warn('Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set. Allowing dev login (admin/admin).');
      return passwordPlain === 'admin';
    }

    logger.error('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required in production environment');
    return false;
  }

  /**
   * Create an admin session after successful login.
   */
  createSession(username: string): AdminSession {
    const token = generateSecureToken(32);
    const csrfToken = generateSecureToken(24);
    const now = Date.now();
    const session: AdminSession = {
      token,
      username,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      csrfToken,
    };
    this.sessions.set(token, session);
    return session;
  }

  /**
   * Validate an existing admin session.
   */
  validateSession(token: string): AdminSession | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  /**
   * Destroy an admin session (logout).
   */
  destroySession(token: string): boolean {
    return this.sessions.delete(token);
  }

  /**
   * Verify a Termux client token.
   * Can be either the server's TUNNEL_MASTER_TOKEN or an ephemeral client token.
   */
  verifyClientToken(token: string): boolean {
    if (!token) return false;

    // Check master token if configured
    if (config.tunnelMasterToken && timingSafeEqual(token, config.tunnelMasterToken)) {
      return true;
    }

    // Check ephemeral/issued client tokens
    const clientToken = this.clientTokens.get(token);
    if (clientToken) {
      if (Date.now() <= clientToken.expiresAt) {
        return true;
      }
      this.clientTokens.delete(token);
    }

    // In dev mode only: if neither master token nor client token is set, accept 'dev-tunnel-token'
    if (!config.isProduction && !config.tunnelMasterToken && token === 'dev-tunnel-token') {
      return true;
    }

    return false;
  }

  /**
   * Create a short-lived client token (used by Dashboard Command Generator).
   */
  createEphemeralClientToken(durationSeconds: number = 86400, label?: string): string {
    const token = `rt_${generateSecureToken(24)}`;
    const now = Date.now();
    this.clientTokens.set(token, {
      token,
      label,
      createdAt: now,
      expiresAt: now + durationSeconds * 1000,
    });
    return token;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
    for (const [token, clientToken] of this.clientTokens.entries()) {
      if (now > clientToken.expiresAt) {
        this.clientTokens.delete(token);
      }
    }
  }
}

export const authService = new AuthService();
