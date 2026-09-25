# R-Tunnel Architecture Documentation

## Overview

R-Tunnel is a specialized temporary HTTP/HTTPS tunneling service engineered specifically for **Render Web Services** and **Android Termux**.

Because Render Web Services expose public HTTP/HTTPS ports and support WebSocket connections—but do not support arbitrary raw TCP port forwarding—R-Tunnel uses an application-layer multiplexed protocol over persistent WebSockets.

---

## High-Level Topology

```text
+-------------------------------------------------------------+
|                      Internet User                          |
|             https://<tunnel-id>.example.com                 |
|              or https://example.com/t/<id>                  |
+-------------------------------------------------------------+
                              |
                              | HTTP / HTTPS Requests
                              v
+-------------------------------------------------------------+
|               Render Web Service (Tunnel Server)            |
|                                                             |
|  - Express HTTP Proxy Interceptor                           |
|  - In-memory Active Tunnel Registry (ITunnelStore)          |
|  - Server-Authoritative Expiration Timer                    |
|  - WebSocket Client Hub (/ws/client)                        |
|  - Dashboard WebSocket Hub (/ws/dashboard)                  |
|  - Admin Auth & Rate Limiter                                |
+-------------------------------------------------------------+
                              |
                              | Persistent Secure WebSocket (WSS)
                              | (JSON Protocol + Base64 Binary Body)
                              v
+-------------------------------------------------------------+
|                    Android Termux Client                    |
|                    (rtunnel CLI Worker)                     |
|                                                             |
|  - Persistent WebSocket with Exponential Backoff Reconnect  |
|  - Ping/Pong Heartbeat Responder                            |
|  - Request Demultiplexer & Local Forwarder                  |
|  - SSRF Guard (Strict 127.0.0.1 validation)                 |
+-------------------------------------------------------------+
                              |
                              | Local Loopback HTTP (127.0.0.1:<port>)
                              v
+-------------------------------------------------------------+
|               Local HTTP Service in Termux                  |
|         (Python, Node.js, Flask, PHP, Go, etc.)             |
+-------------------------------------------------------------+
```

---

## Core Components

### 1. Tunnel Server (Render)
- **Framework:** Node.js, TypeScript, Express, `ws`
- **Responsibilities:**
  - Authenticates Termux clients via `TUNNEL_MASTER_TOKEN` or ephemeral tokens.
  - Dynamically registers temporary tunnels with cryptographically secure random 8-character IDs.
  - Routes inbound HTTP requests to the matching active WebSocket client.
  - Returns responses from the Termux client back to the public caller.
  - Enforces server-side expiration (30m, 1h, 2h, 3h) and optional idle timeout.
  - Serves the real-time dark developer dashboard.

### 2. Tunnel Client (Android Termux)
- **Framework:** Node.js CLI tool (`rtunnel`).
- **Responsibilities:**
  - Maintains persistent outbound WSS connection to the Render server.
  - Receives `http_request` payloads, dispatches them locally to `http://127.0.0.1:<port>`.
  - Serializes HTTP status, response headers, and bodies (encoding binary responses to Base64).
  - Handles automatic reconnection with exponential backoff (1s -> 30s with jitter).
  - Clean shutdown on Ctrl+C (SIGINT/SIGTERM) sending graceful disconnect to the server.

### 3. Multiplexing & Concurrency
- Each HTTP request forwarded over the WebSocket receives a unique `requestId` (UUIDv4).
- The server stores a promise in a pending requests map with a 30-second timeout.
- The client processes requests asynchronously without blocking, allowing concurrent requests.
- When `http_response` arrives matching `requestId`, the pending promise resolves immediately.

### 4. Domain & URL Modes
- **Subdomain Mode:** If `PUBLIC_BASE_DOMAIN=example.com` is configured with wildcard DNS (`*.example.com`), requests to `https://<tunnel-id>.example.com` are transparently routed to `<tunnel-id>`.
- **Path Fallback Mode:** When wildcard DNS is unavailable (e.g. Render free onrender.com subdomains), the service automatically falls back to path-based routing: `https://<render-url>/t/<tunnel-id>/*`.

---

## Scalability & Multi-Instance Roadmap

- **Version 1 (Current):** Single-instance in-memory registry designed for Render single Web Service container.
- **Future Scale:** The code is cleanly isolated behind the `ITunnelStore` interface (`server/src/tunnels/tunnel.store.ts`), enabling a drop-in Redis or PostgreSQL adapter with Redis Pub/Sub for cross-instance WebSocket routing.
