import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateTunnelId, generateSecureToken, hashPassword, verifyPassword, timingSafeEqual } from '../../server/src/utils/crypto.js';

describe('Crypto & ID Generation Utilities', () => {
  test('generateTunnelId produces secure random lowercase alphanumeric strings', () => {
    const id = generateTunnelId(8);
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(id.length, 8);
    assert.match(id, /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);

    // Ensure 100 generated IDs are all unique (no collisions)
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const generated = generateTunnelId(8);
      assert.strictEqual(set.has(generated), false, `Collision detected on ${generated}`);
      set.add(generated);
    }
  });

  test('generateSecureToken generates hex tokens', () => {
    const token = generateSecureToken(16);
    assert.strictEqual(token.length, 32);
    assert.match(token, /^[0-9a-f]{32}$/);
  });

  test('hashPassword and verifyPassword work correctly with bcrypt', async () => {
    const plain = 'secretPass123!';
    const hash = await hashPassword(plain);

    assert.notStrictEqual(plain, hash);
    assert.ok(hash.startsWith('$2'));

    const matchTrue = await verifyPassword(plain, hash);
    assert.strictEqual(matchTrue, true);

    const matchFalse = await verifyPassword('wrongPass', hash);
    assert.strictEqual(matchFalse, false);
  });

  test('timingSafeEqual safely checks token equality', () => {
    assert.strictEqual(timingSafeEqual('myToken123', 'myToken123'), true);
    assert.strictEqual(timingSafeEqual('myToken123', 'otherToken'), false);
    assert.strictEqual(timingSafeEqual('myToken123', 'myToken12'), false);
    assert.strictEqual(timingSafeEqual('', 'myToken123'), false);
  });

  test('authService verifyAdmin supports plaintext ADMIN_PASSWORD', async () => {
    const { authService } = await import('../../server/src/auth/auth.service.js');
    const { config } = await import('../../server/src/config.js');

    config.adminUsername = 'myadmin';
    config.adminPassword = 'plainPassword123';
    config.adminPasswordHash = '';

    assert.strictEqual(await authService.verifyAdmin('myadmin', 'plainPassword123'), true);
    assert.strictEqual(await authService.verifyAdmin('myadmin', 'wrong'), false);
    assert.strictEqual(await authService.verifyAdmin('otheruser', 'plainPassword123'), false);

    // Clean up
    config.adminUsername = 'admin';
    config.adminPassword = '';
  });
});
