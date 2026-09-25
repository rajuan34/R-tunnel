/**
 * SSRF and Network Security Validations
 *
 * Enforces that the Render server NEVER acts as an arbitrary outbound proxy,
 * and that client local targets are strictly confined to localhost / 127.0.0.1.
 */

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isLocalhostAddress(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

/**
 * Validates requested tunnel parameters to prevent abuse.
 */
export function validateTunnelRequest(params: {
  port: number;
  durationSeconds?: number;
  maxDuration: number;
}): { valid: boolean; error?: string } {
  if (!isValidPort(params.port)) {
    return { valid: false, error: 'Invalid port. Port must be between 1 and 65535.' };
  }

  if (params.durationSeconds !== undefined) {
    if (params.durationSeconds < 60) {
      return { valid: false, error: 'Duration must be at least 1 minute (60s).' };
    }
    if (params.durationSeconds > params.maxDuration) {
      return {
        valid: false,
        error: `Duration exceeds maximum allowed lifetime of ${params.maxDuration / 3600} hours.`,
      };
    }
  }

  return { valid: true };
}
