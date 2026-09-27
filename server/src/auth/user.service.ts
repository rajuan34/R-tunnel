import fs from 'node:fs';
import path from 'node:path';
import { generateSecureToken, timingSafeEqual } from '../utils/crypto.js';
import { logger } from '../logging/logger.js';

export interface ManagedUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  note?: string;
  masterKey: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  maxTunnels: number; // 0 = unlimited
  createdAt: number;
  expiresAt: number | null; // null = never expires
  lastUsedAt?: number;
  lastClientIp?: string;
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string;
  note?: string;
  masterKey?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'suspended';
  maxTunnels?: number;
  expiresInDays?: number;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
  note?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'suspended';
  maxTunnels?: number;
  expiresAt?: number | null;
}

export class UserService {
  private users = new Map<string, ManagedUser>(); // key: user.id
  private storageFilePath: string;
  private initialized = false;

  constructor(storageDir: string = 'data') {
    this.storageFilePath = path.resolve(process.cwd(), storageDir, 'users.json');
    this.init();
  }

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const u of parsed) {
            if (u && u.id && u.username && u.masterKey) {
              this.users.set(u.id, {
                ...u,
                username: u.username.toLowerCase(),
                maxTunnels: typeof u.maxTunnels === 'number' ? u.maxTunnels : 5,
                status: u.status === 'suspended' ? 'suspended' : 'active',
                role: u.role === 'admin' ? 'admin' : 'user',
              });
            }
          }
          logger.info(`Loaded ${this.users.size} managed users from storage`);
        }
      } else {
        // Save initial empty array
        this.saveToDisk();
      }
    } catch (err: any) {
      logger.warn(`Could not load users from ${this.storageFilePath}, using in-memory store`, {
        error: err?.message,
      });
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.users.values());
      const tempPath = `${this.storageFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.storageFilePath);
    } catch (err: any) {
      logger.error('Failed to save users to disk', { error: err?.message });
    }
  }

  /**
   * Get all registered users.
   */
  getAllUsers(): ManagedUser[] {
    return Array.from(this.users.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Find user by ID.
   */
  getUserById(id: string): ManagedUser | null {
    return this.users.get(id) || null;
  }

  /**
   * Find user by username (case-insensitive).
   */
  getUserByUsername(username: string): ManagedUser | null {
    if (!username) return null;
    const clean = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === clean) {
        return user;
      }
    }
    return null;
  }

  /**
   * Find user by Master Key using timing-safe comparison.
   */
  getUserByMasterKey(key: string): ManagedUser | null {
    if (!key) return null;
    for (const user of this.users.values()) {
      if (timingSafeEqual(user.masterKey, key)) {
        return user;
      }
    }
    return null;
  }

  /**
   * Verify whether a Master Key is valid, active, and unexpired.
   * If valid, updates lastUsedAt and returns the user.
   */
  verifyUserMasterKey(key: string, clientIp?: string): ManagedUser | null {
    const user = this.getUserByMasterKey(key);
    if (!user) return null;

    // Check account status
    if (user.status !== 'active') {
      logger.warn(`User master key used for suspended account: ${user.username}`);
      return null;
    }

    // Check key expiration
    if (user.expiresAt && Date.now() > user.expiresAt) {
      logger.warn(`User master key expired for user: ${user.username}`);
      return null;
    }

    // Update last activity
    user.lastUsedAt = Date.now();
    if (clientIp) {
      user.lastClientIp = clientIp;
    }
    this.saveToDisk();

    return user;
  }

  /**
   * Create a new user with an auto-generated or custom Master Key.
   */
  createUser(input: CreateUserInput): { user: ManagedUser; error?: string } {
    const username = (input.username || '').trim().toLowerCase();

    // Validate username format
    if (!username || username.length < 2 || username.length > 32) {
      return { user: null as any, error: 'Username must be between 2 and 32 characters.' };
    }
    if (!/^[a-z0-9_-]+$/.test(username)) {
      return {
        user: null as any,
        error: 'Username can only contain alphanumeric characters, hyphens, and underscores.',
      };
    }

    // Check uniqueness
    if (this.getUserByUsername(username)) {
      return { user: null as any, error: `Username "${username}" already exists.` };
    }

    // Generate or validate Master Key
    let masterKey = (input.masterKey || '').trim();
    if (masterKey) {
      if (masterKey.length < 8) {
        return { user: null as any, error: 'Custom master key must be at least 8 characters long.' };
      }
      if (this.getUserByMasterKey(masterKey)) {
        return { user: null as any, error: 'This master key is already assigned to another user.' };
      }
    } else {
      masterKey = `rt_master_${generateSecureToken(20)}`;
    }

    const now = Date.now();
    let expiresAt: number | null = null;
    if (input.expiresInDays && input.expiresInDays > 0) {
      expiresAt = now + input.expiresInDays * 24 * 60 * 60 * 1000;
    }

    const id = `usr_${generateSecureToken(8)}`;
    const user: ManagedUser = {
      id,
      username,
      displayName: input.displayName?.trim() || undefined,
      email: input.email?.trim() || undefined,
      note: input.note?.trim() || undefined,
      masterKey,
      role: input.role === 'admin' ? 'admin' : 'user',
      status: input.status === 'suspended' ? 'suspended' : 'active',
      maxTunnels: typeof input.maxTunnels === 'number' ? Math.max(0, input.maxTunnels) : 5,
      createdAt: now,
      expiresAt,
    };

    this.users.set(id, user);
    this.saveToDisk();

    logger.info('Managed user created', {
      userId: id,
      username: user.username,
      role: user.role,
      maxTunnels: user.maxTunnels,
    });

    return { user };
  }

  /**
   * Update an existing user.
   */
  updateUser(id: string, updates: UpdateUserInput): { user: ManagedUser | null; error?: string } {
    const user = this.users.get(id);
    if (!user) {
      return { user: null, error: 'User not found.' };
    }

    if (updates.displayName !== undefined) {
      user.displayName = updates.displayName.trim() || undefined;
    }
    if (updates.email !== undefined) {
      user.email = updates.email.trim() || undefined;
    }
    if (updates.note !== undefined) {
      user.note = updates.note.trim() || undefined;
    }
    if (updates.role !== undefined) {
      user.role = updates.role === 'admin' ? 'admin' : 'user';
    }
    if (updates.status !== undefined) {
      user.status = updates.status === 'suspended' ? 'suspended' : 'active';
    }
    if (typeof updates.maxTunnels === 'number') {
      user.maxTunnels = Math.max(0, updates.maxTunnels);
    }
    if (updates.expiresAt !== undefined) {
      user.expiresAt = updates.expiresAt;
    }

    this.saveToDisk();
    logger.info('Managed user updated', { userId: id, username: user.username });
    return { user };
  }

  /**
   * Regenerate or set a new Master Key for a user.
   */
  regenerateMasterKey(id: string, customKey?: string): { user: ManagedUser | null; newMasterKey?: string; error?: string } {
    const user = this.users.get(id);
    if (!user) {
      return { user: null, error: 'User not found.' };
    }

    let newKey = (customKey || '').trim();
    if (newKey) {
      if (newKey.length < 8) {
        return { user: null, error: 'Custom master key must be at least 8 characters long.' };
      }
      const existing = this.getUserByMasterKey(newKey);
      if (existing && existing.id !== id) {
        return { user: null, error: 'This master key is already assigned to another user.' };
      }
    } else {
      newKey = `rt_master_${generateSecureToken(20)}`;
    }

    user.masterKey = newKey;
    this.saveToDisk();

    logger.info('User master key regenerated', { userId: id, username: user.username });
    return { user, newMasterKey: newKey };
  }

  /**
   * Delete a user by ID.
   */
  deleteUser(id: string): { success: boolean; deletedUser: ManagedUser | null } {
    const user = this.users.get(id);
    if (!user) {
      return { success: false, deletedUser: null };
    }

    this.users.delete(id);
    this.saveToDisk();

    logger.info('Managed user deleted', { userId: id, username: user.username });
    return { success: true, deletedUser: user };
  }

  /**
   * Record client activity for a user.
   */
  recordUserActivity(id: string, clientIp?: string): void {
    const user = this.users.get(id);
    if (user) {
      user.lastUsedAt = Date.now();
      if (clientIp) user.lastClientIp = clientIp;
      this.saveToDisk();
    }
  }

  /**
   * Get user counts / stats.
   */
  getUserStats(): { total: number; active: number; suspended: number } {
    let active = 0;
    let suspended = 0;
    for (const u of this.users.values()) {
      if (u.status === 'active') active++;
      else suspended++;
    }
    return { total: this.users.size, active, suspended };
  }
}

export const userService = new UserService();
