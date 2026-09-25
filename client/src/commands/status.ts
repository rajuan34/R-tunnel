import http from 'node:http';
import https from 'node:https';
import { loadConfig, getConfigPath } from '../config.js';

export async function statusCommand(): Promise<void> {
  const config = loadConfig();
  console.log('\x1b[1;36mR-Tunnel Client Configuration & Status\x1b[0m\n');
  console.log(`Config path: \x1b[90m${getConfigPath()}\x1b[0m`);
  console.log(`Server URL:  \x1b[1m${config.serverUrl || '(not configured)'}\x1b[0m`);
  console.log(`Token:       \x1b[1m${config.token ? '••••••••' + config.token.slice(-4) : '(not configured)'}\x1b[0m`);

  if (!config.serverUrl) {
    console.log('\n\x1b[33mRun rtunnel login to configure your server and token.\x1b[0m');
    return;
  }

  const healthUrl = `${config.serverUrl.replace(/\/+$/, '')}/health`;
  console.log(`\nChecking server health at ${healthUrl}...`);

  const clientModule = healthUrl.startsWith('https://') ? https : http;

  clientModule.get(healthUrl, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('\x1b[32m✔ Server is ONLINE and reachable!\x1b[0m');
      } else {
        console.log(`\x1b[31m✖ Server returned status ${res.statusCode}\x1b[0m`);
      }
    });
  }).on('error', (err) => {
    console.log(`\x1b[31m✖ Could not connect to server: ${err.message}\x1b[0m`);
  });
}
