import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMessage,
  serializeMessage,
  parseMessage,
  TunnelMessage,
  HttpRequestPayload,
  HttpResponsePayload,
} from '../../server/src/websocket/protocol.js';

describe('Tunnel Protocol Serializer & Parser', () => {
  test('creates structured protocol messages', () => {
    const msg = createMessage('client_hello', { token: 'test-token' }, 'tunnel123', 'req-1');
    assert.strictEqual(msg.type, 'client_hello');
    assert.strictEqual(msg.tunnelId, 'tunnel123');
    assert.strictEqual(msg.requestId, 'req-1');
    assert.ok(msg.timestamp > 0);
    assert.deepStrictEqual(msg.payload, { token: 'test-token' });
  });

  test('serializes and parses protocol messages losslessly', () => {
    const original: TunnelMessage<HttpRequestPayload> = {
      type: 'http_request',
      requestId: 'req-42',
      tunnelId: 'x7k29m4p',
      timestamp: Date.now(),
      payload: {
        requestId: 'req-42',
        method: 'POST',
        path: '/api/v1/data?foo=bar',
        query: { foo: 'bar' },
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
        isBase64: false,
      },
    };

    const serialized = serializeMessage(original);
    const parsed = parseMessage(serialized);

    assert.ok(parsed !== null);
    assert.strictEqual(parsed.type, 'http_request');
    assert.strictEqual(parsed.requestId, 'req-42');
    assert.strictEqual(parsed.tunnelId, 'x7k29m4p');
    assert.deepStrictEqual(parsed.payload, original.payload);
  });

  test('handles invalid JSON gracefully', () => {
    assert.strictEqual(parseMessage(''), null);
    assert.strictEqual(parseMessage('{invalid json'), null);
    assert.strictEqual(parseMessage('{"noType": true}'), null);
  });
});
