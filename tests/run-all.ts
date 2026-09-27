import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  path.join(__dirname, 'unit/crypto.test.ts'),
  path.join(__dirname, 'unit/user.test.ts'),
  path.join(__dirname, 'unit/protocol.test.ts'),
  path.join(__dirname, 'unit/ssrf.test.ts'),
  path.join(__dirname, 'integration/end-to-end.test.ts'),
];

console.log('Running R-Tunnel Automated Test Suite...\n');

run({ files: testFiles })
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .compose(new spec())
  .pipe(process.stdout);
