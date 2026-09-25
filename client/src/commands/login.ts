import readline from 'node:readline';
import { saveConfig, loadConfig } from '../config.js';

export async function loginCommand(args: { server?: string; token?: string }): Promise<void> {
  const existing = loadConfig();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string, defaultVal?: string): Promise<string> => {
    return new Promise((resolve) => {
      const q = defaultVal ? `${prompt} (${defaultVal}): ` : `${prompt}: `;
      rl.question(q, (ans) => {
        resolve(ans.trim() || defaultVal || '');
      });
    });
  };

  try {
    let server = args.server;
    let token = args.token;

    if (!server) {
      server = await question('R-Tunnel Server URL', existing.serverUrl || 'https://r-tunnel.onrender.com');
    }

    if (!token) {
      token = await question('Authentication Token', existing.token);
    }

    if (!server) {
      console.error('\x1b[31mError: Server URL cannot be empty.\x1b[0m');
      process.exit(1);
    }

    if (!token) {
      console.error('\x1b[31mError: Token cannot be empty.\x1b[0m');
      process.exit(1);
    }

    saveConfig({
      serverUrl: server.replace(/\/+$/, ''),
      token,
    });

    console.log('\n\x1b[32m✔ Configuration saved successfully to ~/.rtunnel/config.json\x1b[0m');
    console.log('You can now run: \x1b[36mrtunnel 8080\x1b[0m to create a tunnel!');
  } finally {
    rl.close();
  }
}
