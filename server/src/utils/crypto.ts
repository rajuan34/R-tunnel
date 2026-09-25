import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// Safe character set: lowercase alphanumeric excluding ambiguous chars like 0, o, 1, l, i
const TUNNEL_ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';

/**
 * Generate a cryptographically secure random tunnel ID.
 * Defaults to 8 characters using safe lowercase alphanumeric chars.
 */
export function generateTunnelId(length: number = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += TUNNEL_ID_CHARS[bytes[i] % TUNNEL_ID_CHARS.length];
  }
  return result;
}

/**
 * Generate a cryptographically secure random token (hex or base64url).
 */
export function generateSecureToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Generate a unique request ID (UUIDv4 or random hex).
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

/**
 * Verify a plain text password against a bcrypt hash.
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Pad to avoid leaking length through timing, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
