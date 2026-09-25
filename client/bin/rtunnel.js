#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bundledPath = path.resolve(__dirname, '../../dist/client/cli.js');
const localBundledPath = path.resolve(__dirname, '../dist/cli.js');

let targetPath = '';
if (fs.existsSync(bundledPath)) {
  targetPath = bundledPath;
} else if (fs.existsSync(localBundledPath)) {
  targetPath = localBundledPath;
} else {
  // In source dev or tsx environments
  targetPath = path.resolve(__dirname, '../src/cli.ts');
}

const { main } = await import(targetPath);
main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err.message);
  process.exit(1);
});
