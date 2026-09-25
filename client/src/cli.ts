import { loginCommand } from './commands/login.js';
import { createCommand } from './commands/create.js';
import { statusCommand } from './commands/status.js';

const VERSION = '1.0.0';

function printHelp(): void {
  console.log(`
\x1b[1;36mR-Tunnel CLI\x1b[0m — Temporary HTTP/HTTPS Tunnel Client (Android Termux)
Version: ${VERSION}

\x1b[1mUSAGE:\x1b[0m
  rtunnel <port>                         Create tunnel for local port (e.g., rtunnel 8080)
  rtunnel create --port <port> [options] Create a tunnel with options
  rtunnel login                          Configure server URL and authentication token
  rtunnel status                         Check client configuration and server connectivity
  rtunnel version                        Print current version
  rtunnel help                           Print this help message

\x1b[1mOPTIONS for 'create':\x1b[0m
  -p, --port <port>          Local port to expose (required)
  -d, --duration <duration>  Tunnel lifetime: 30m, 1h, 2h, 3h (default: 1h)
  -s, --server <url>         Override server URL (e.g., https://r-tunnel.onrender.com)
  -t, --token <token>        Override authentication token
  -l, --label <name>         Optional tunnel label
  --id <tunnel-id>           Reconnect to existing active tunnel ID

\x1b[1mEXAMPLES:\x1b[0m
  $ rtunnel login
  $ rtunnel 8080
  $ rtunnel create --port 3000 --duration 2h
  $ rtunnel create --port 8080 --server https://r-tunnel.onrender.com --token my-token
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0) {
    printHelp();
    return;
  }

  const firstArg = argv[0].toLowerCase();

  // 1. Shorthand: rtunnel 8080
  if (/^\d+$/.test(firstArg)) {
    const port = parseInt(firstArg, 10);
    // Parse any additional flags like -d 2h
    const options = parseFlags(argv.slice(1));
    await createCommand({
      port,
      duration: options.duration || options.d,
      server: options.server || options.s,
      token: options.token || options.t,
      label: options.label || options.l,
      id: options.id,
    });
    return;
  }

  // 2. Subcommands
  switch (firstArg) {
    case 'login': {
      const options = parseFlags(argv.slice(1));
      await loginCommand({
        server: options.server || options.s,
        token: options.token || options.t,
      });
      break;
    }

    case 'create': {
      const options = parseFlags(argv.slice(1));
      const port = parseInt(options.port || options.p, 10);
      await createCommand({
        port,
        duration: options.duration || options.d,
        server: options.server || options.s,
        token: options.token || options.t,
        label: options.label || options.l,
        id: options.id,
      });
      break;
    }

    case 'status':
    case 'list': {
      await statusCommand();
      break;
    }

    case 'version':
    case '-v':
    case '--version': {
      console.log(`R-Tunnel v${VERSION}`);
      break;
    }

    case 'help':
    case '-h':
    case '--help':
    default: {
      printHelp();
      break;
    }
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return flags;
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal CLI error:', err);
    process.exit(1);
  });
}
