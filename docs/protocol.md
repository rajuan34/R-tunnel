# R-Tunnel WebSocket Protocol Specification (v1.0)

## Overview

The R-Tunnel protocol governs bidirectional communication between the Render tunnel server and Android Termux clients over persistent WebSocket connections (`wss://<server-domain>/ws/client`).

Every message is formatted as a UTF-8 JSON envelope:

```json
{
  "type": "<message_type>",
  "requestId": "<uuid_or_unique_id>",
  "tunnelId": "<tunnel_id>",
  "timestamp": 1727220000000,
  "payload": {}
}
```

---

## Message Types

| Message Type | Direction | Description |
|---|---|---|
| `client_hello` | Client -> Server | Handshake initiation & client token authentication |
| `server_hello` | Server -> Client | Confirmation of authentication & server configuration |
| `create_tunnel` | Client -> Server | Request to create or bind a tunnel for a local port |
| `tunnel_created` | Server -> Client | Confirmation of active tunnel with public URL & expiration |
| `http_request` | Server -> Client | Inbound HTTP request to be proxied to localhost |
| `http_response` | Client -> Server | HTTP response from local service to be returned to caller |
| `ping` | Either | Heartbeat ping |
| `pong` | Either | Heartbeat pong response |
| `tunnel_expiring` | Server -> Client | Warning that tunnel expiration is approaching (≤5 mins) |
| `tunnel_expired` | Server -> Client | Notification that tunnel has expired and closed |
| `disconnect` | Client -> Server | Clean shutdown notification from client (e.g. on Ctrl+C) |
| `error` | Either | Error reporting |

---

## Flow Sequences

### 1. Connection & Handshake

```text
Client                                Server
  |                                     |
  | -------- client_hello ------------> | (Validates token)
  | <------- server_hello ------------- | (Auth confirmed)
  |                                     |
  | -------- create_tunnel -----------> | (Port: 8080, Duration: 3600)
  | <------- tunnel_created ----------- | (ID: x7k29m4p, URL: https://...)
  |                                     |
```

### 2. HTTP Request Multiplexing

```text
Internet User              Render Server                 Termux Client           127.0.0.1:8080
      |                          |                             |                        |
      | --- GET /api/data -----> |                             |                        |
      |                          | --- http_request ---------> |                        |
      |                          |     (requestId: uuid-1)     | --- GET /api/data ---> |
      |                          |                             | <--- 200 OK (data) --- |
      |                          | <--- http_response -------- |                        |
      |                          |      (requestId: uuid-1)    |                        |
      | <--- 200 OK (data) ----- |                             |                        |
```

### 3. Binary Body Transport

Binary responses (images, videos, PDFs, zip files, or binary content types) are Base64 encoded before transmission across the WebSocket to prevent payload corruption:

```json
{
  "type": "http_response",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "tunnelId": "x7k29m4p",
  "timestamp": 1727220050000,
  "payload": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "statusCode": 200,
    "headers": {
      "content-type": "image/png"
    },
    "body": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "isBase64": true
  }
}
```

The Render server inspects `isBase64: true`, decodes the Base64 string back into raw bytes (`Buffer.from(payload.body, 'base64')`), and writes the binary stream directly to the HTTP response.
