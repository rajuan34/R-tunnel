import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPort, isLocalhostAddress, validateTunnelRequest } from '../../server/src/security/ssrf.js';
import { isValidLocalhost } from '../../client/src/proxy.js';

describe('SSRF & Parameter Validations', () => {
  test('validates port range properly', () => {
    assert.strictEqual(isValidPort(80), true);
    assert.strictEqual(isValidPort(8080), true);
    assert.strictEqual(isValidPort(65535), true);
    assert.strictEqual(isValidPort(0), false);
    assert.strictEqual(isValidPort(-1), false);
    assert.strictEqual(isValidPort(65536), false);
    assert.strictEqual(isValidPort(NaN), false);
  });

  test('validates localhost addresses strictly', () => {
    assert.strictEqual(isLocalhostAddress('localhost'), true);
    assert.strictEqual(isLocalhostAddress('127.0.0.1'), true);
    assert.strictEqual(isLocalhostAddress('::1'), true);
    assert.strictEqual(isLocalhostAddress('192.168.1.1'), false);
    assert.strictEqual(isLocalhostAddress('10.0.0.1'), false);
    assert.strictEqual(isLocalhostAddress('169.254.169.254'), false);
    assert.strictEqual(isLocalhostAddress('google.com'), false);

    assert.strictEqual(isValidLocalhost('127.0.0.1'), true);
    assert.strictEqual(isValidLocalhost('localhost'), true);
    assert.strictEqual(isValidLocalhost('192.168.1.100'), false);
  });

  test('enforces tunnel creation constraints and lifetime limits', () => {
    const ok = validateTunnelRequest({ port: 3000, durationSeconds: 3600, maxDuration: 10800 });
    assert.strictEqual(ok.valid, true);

    const badPort = validateTunnelRequest({ port: 70000, durationSeconds: 3600, maxDuration: 10800 });
    assert.strictEqual(badPort.valid, false);

    const tooShort = validateTunnelRequest({ port: 8080, durationSeconds: 10, maxDuration: 10800 });
    assert.strictEqual(tooShort.valid, false);

    const tooLong = validateTunnelRequest({ port: 8080, durationSeconds: 20000, maxDuration: 10800 });
    assert.strictEqual(tooLong.valid, false);
  });
});
