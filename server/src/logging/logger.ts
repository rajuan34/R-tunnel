import { config } from '../config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'mastertoken',
  'password',
  'secret',
  'api-key',
  'apikey',
  'adminpasswordhash',
]);

export function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

class Logger {
  private currentPriority: number;

  constructor() {
    const configuredLevel = (config.logLevel as LogLevel) || 'info';
    this.currentPriority = LOG_LEVEL_PRIORITY[configuredLevel] ?? 1;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.currentPriority;
  }

  private formatMessage(level: LogLevel, event: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? sanitizeData(meta) : undefined;
    const metaStr = cleanMeta ? ` ${JSON.stringify(cleanMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${event}${metaStr}`;
  }

  debug(event: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', event, meta));
    }
  }

  info(event: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', event, meta));
    }
  }

  warn(event: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', event, meta));
    }
  }

  error(event: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', event, meta));
    }
  }
}

export const logger = new Logger();
