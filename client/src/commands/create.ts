import { loadConfig } from '../config.js';
import { TunnelClient } from '../websocket.js';

function parseDuration(durationStr?: string): number {
  if (!durationStr) return 3600; // default 1 hour
  const match = durationStr.match(/^(\d+)(m|h)?$/i);
  if (!match) return 3600;
  const val = parseInt(match[1], 10);
  const unit = (match[2] || 'h').toLowerCase();
  if (unit === 'm') return val * 60;
  return val * 3600;
}

export async function createCommand(args: {
  port: number;
  server?: string;
  token?: string;
  duration?: string;
  label?: string;
  id?: string;
}): Promise<void> {
  const config = loadConfig();

  const serverUrl = args.server || config.serverUrl;
  const token = args.token || config.token;

  if (!serverUrl) {
    console.error('\x1b[31mError: Server URL not configured.\x1b[0m');
    console.error('Please run: \x1b[36mrtunnel login\x1b[0m or supply \x1b[36m--server <url>\x1b[0m');
    process.exit(1);
  }

  if (!token) {
    console.error('\x1b[31mError: Tunnel token not configured.\x1b[0m');
    console.error('Please run: \x1b[36mrtunnel login\x1b[0m or supply \x1b[36m--token <token>\x1b[0m');
    process.exit(1);
  }

  if (!args.port || isNaN(args.port) || args.port < 1 || args.port > 65535) {
    console.error('\x1b[31mError: Invalid local port. Must be between 1 and 65535.\x1b[0m');
    process.exit(1);
  }

  const durationSeconds = parseDuration(args.duration);

  const client = new TunnelClient({
    serverUrl,
    token,
    localPort: args.port,
    durationSeconds,
    label: args.label,
    customTunnelId: args.id,
  });

  await client.start();
}
