import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { userService } from '../../server/src/auth/user.service.js';
import { authService } from '../../server/src/auth/auth.service.js';

describe('User Management & Master Key Authentication', () => {
  test('creates a new user with auto-generated master key', () => {
    const testUsername = `testuser_${Date.now()}`;
    const result = userService.createUser({
      username: testUsername,
      displayName: 'Test User 1',
      note: 'Termux test node',
      role: 'user',
      maxTunnels: 3,
    });

    assert.ok(result.user, 'User should be created');
    assert.strictEqual(result.user.username, testUsername);
    assert.strictEqual(result.user.role, 'user');
    assert.strictEqual(result.user.status, 'active');
    assert.strictEqual(result.user.maxTunnels, 3);
    assert.ok(result.user.masterKey.startsWith('rt_master_'), 'Master key should start with rt_master_');
    assert.ok(result.user.masterKey.length > 20, 'Master key should be adequately long');
  });

  test('prevents creating duplicate usernames', () => {
    const dupUsername = `dup_${Date.now()}`;
    const res1 = userService.createUser({ username: dupUsername });
    assert.ok(res1.user);

    const res2 = userService.createUser({ username: dupUsername });
    assert.strictEqual(res2.user, null);
    assert.ok(res2.error?.includes('already exists'));
  });

  test('verifies master key via userService and authService', () => {
    const username = `auth_test_${Date.now()}`;
    const { user } = userService.createUser({ username });
    assert.ok(user);

    // Direct user service verification
    const verified = userService.verifyUserMasterKey(user.masterKey, '127.0.0.1');
    assert.ok(verified);
    assert.strictEqual(verified.username, username);

    // Auth service client token verification
    const isValidToken = authService.verifyClientToken(user.masterKey, '127.0.0.1');
    assert.strictEqual(isValidToken, true);

    // Check wrong token fails
    const isInvalid = authService.verifyClientToken('rt_master_invalid_key_12345');
    assert.strictEqual(isInvalid, false);
  });

  test('regenerating master key updates key and revokes previous key', () => {
    const username = `regen_${Date.now()}`;
    const { user } = userService.createUser({ username });
    assert.ok(user);
    const oldKey = user.masterKey;

    const regen = userService.regenerateMasterKey(user.id);
    assert.ok(regen.newMasterKey);
    assert.notStrictEqual(regen.newMasterKey, oldKey);

    // Old key no longer works
    assert.strictEqual(authService.verifyClientToken(oldKey), false);

    // New key works
    assert.strictEqual(authService.verifyClientToken(regen.newMasterKey), true);
  });

  test('suspended users cannot authenticate with master key', () => {
    const username = `susp_${Date.now()}`;
    const { user } = userService.createUser({ username, status: 'suspended' });
    assert.ok(user);

    // Key should not authenticate while suspended
    const verified = userService.verifyUserMasterKey(user.masterKey);
    assert.strictEqual(verified, null);
    assert.strictEqual(authService.verifyClientToken(user.masterKey), false);

    // Re-activate
    userService.updateUser(user.id, { status: 'active' });
    assert.strictEqual(authService.verifyClientToken(user.masterKey), true);
  });

  test('deleting a user revokes their master key', () => {
    const username = `del_${Date.now()}`;
    const { user } = userService.createUser({ username });
    assert.ok(user);

    assert.strictEqual(authService.verifyClientToken(user.masterKey), true);

    const delResult = userService.deleteUser(user.id);
    assert.strictEqual(delResult.success, true);
    assert.strictEqual(authService.verifyClientToken(user.masterKey), false);
  });
});
