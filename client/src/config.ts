import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ClientConfig {
  serverUrl?: string;
  token?: string;
  defaultDuration?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.rtunnel');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): ClientConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveConfig(config: ClientConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    // Ensure restrictive permissions on Unix/Termux
    try {
      fs.chmodSync(CONFIG_FILE, 0o600);
      fs.chmodSync(CONFIG_DIR, 0o700);
    } catch {}
  } catch (err: any) {
    console.error(`Failed to save configuration: ${err.message}`);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
