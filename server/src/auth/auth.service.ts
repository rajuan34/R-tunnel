import { config } from '../config.js';
import { verifyPassword, hashPassword, generateSecureToken, timingSafeEqual } from '../utils/crypto.js';
import { logger } from '../logging/logger.js';
import { userService, ManagedUser } from './user.service.js';

export interface AdminSession {
  token: string;
  username: string;
  role?: 'admin' | 'user';
  userId?: string;
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
   * Verify admin or user credentials for dashboard access.
   */
  async verifyAdmin(username: string, passwordPlain: string): Promise<{ valid: boolean; user?: ManagedUser }> {
    if (!username || !passwordPlain) return { valid: false };

    // 1. Primary config admin account
    if (username === config.adminUsername) {
      if (config.adminPassword) {
        if (timingSafeEqual(passwordPlain, config.adminPassword)) {
          return { valid: true };
        }
      } else if (config.adminPasswordHash) {
        try {
          const ok = await verifyPassword(passwordPlain, config.adminPasswordHash);
          if (ok) return { valid: true };
        } catch (err) {
          logger.error('Error verifying admin password hash', { err });
        }
      } else if (!config.isProduction) {
        if (passwordPlain === 'admin') {
          return { valid: true };
        }
      }
    }

    // 2. Check if a managed user exists with matching Master Key
    const managedUser = userService.getUserByUsername(username);
    if (managedUser && managedUser.status === 'active') {
      if (timingSafeEqual(passwordPlain, managedUser.masterKey)) {
        return { valid: true, user: managedUser };
      }
    }

    return { valid: false };
  }

  /**
   * Create a session after successful login.
   */
  createSession(username: string, role: 'admin' | 'user' = 'admin', userId?: string): AdminSession {
    const token = generateSecureToken(32);
    const csrfToken = generateSecureToken(24);
    const now = Date.now();
    const session: AdminSession = {
      token,
      username,
      role,
      userId,
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
   * Verify a Termux client token or user Master Key.
   * Can be either:
   * 1. The server's TUNNEL_MASTER_TOKEN
   * 2. An ephemeral client token
   * 3. A dedicated Managed User Master Key
   */
  verifyClientToken(token: string, clientIp?: string): boolean {
    if (!token) return false;

    // 1. Check server master token if configured
    if (config.tunnelMasterToken && timingSafeEqual(token, config.tunnelMasterToken)) {
      return true;
    }

    // 2. Check ephemeral/issued client tokens
    const clientToken = this.clientTokens.get(token);
    if (clientToken) {
      if (Date.now() <= clientToken.expiresAt) {
        return true;
      }
      this.clientTokens.delete(token);
    }

    // 3. Check managed user master key
    const user = userService.verifyUserMasterKey(token, clientIp);
    if (user) {
      return true;
    }

    // In dev mode only: if neither master token nor client token is set, accept 'dev-tunnel-token'
    if (!config.isProduction && !config.tunnelMasterToken && token === 'dev-tunnel-token') {
      return true;
    }

    return false;
  }

  /**
   * Get user assigned to this Master Key if any.
   */
  getUserByToken(token: string): ManagedUser | null {
    if (!token) return null;
    return userService.getUserByMasterKey(token);
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

  /**
   * List active client access tokens.
   */
  listClientTokens(): ClientTokenInfo[] {
    const now = Date.now();
    const result: ClientTokenInfo[] = [];
    for (const [token, info] of this.clientTokens.entries()) {
      if (now <= info.expiresAt) {
        result.push({ ...info });
      }
    }
    return result;
  }

  /**
   * Revoke an active client token.
   */
  revokeClientToken(token: string): boolean {
    return this.clientTokens.delete(token);
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
