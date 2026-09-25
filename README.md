# R-Tunnel — Temporary HTTP/HTTPS Tunnel Service

<div align="center">
  <h3>Secure, personal ngrok-style HTTP tunneling service engineered for <strong>Render Web Services</strong> and <strong>Android Termux</strong>.</h3>
</div>

---

## Key Features

- **Designed for Render:** Runs seamlessly on Render Web Services using WebSockets (`wss://`). No raw TCP port forwarding required.
- **Android Termux First-Class Support:** Lightweight Node.js CLI with zero bloat, persistent connections, and automatic exponential backoff reconnection.
- **Server-Authoritative Expiration:** Fixed lifetimes (`30m`, `1h`, `2h`, `3h`) and optional idle timeouts enforced by the server clock.
- **Strict Anti-SSRF Protection:** Termux client strictly routes only to `127.0.0.1` and `localhost`. Arbitrary upstream proxying is completely prevented.
- **Binary Data Integrity:** Automatic Base64 transport preserves binary responses (images, media, PDFs, downloads) without corruption.
- **Modern Dark Developer Dashboard:** Real-time metrics, active tunnel countdowns, live activity stream, and instant Termux command generator.
- **No Database Required (v1):** In-memory session and tunnel registry structured behind a clean interface ready for Redis/Postgres expansion.

---

## Architecture

```text
Termux Local HTTP Server (e.g. 127.0.0.1:8080)
   ↕ Local Loopback HTTP
Termux Tunnel Client (rtunnel CLI)
   ↕ Persistent Secure WebSocket (WSS)
Render Tunnel Server
   ↕ Public HTTPS URL (Subdomain or /t/:id)
Internet User / Web Browser
```

---

## Quickstart: Termux Setup

1. **Install Node.js in Termux:**
   ```bash
   pkg update && pkg install nodejs git
   ```

2. **Install R-Tunnel Client:**
   ```bash
   git clone https://github.com/rajuan/r-tunnel.git
   cd r-tunnel/client && chmod +x install.sh && ./install.sh
   ```

3. **Login with your server and token:**
   ```bash
   rtunnel login
   ```

4. **Expose your local server:**
   ```bash
   # Expose port 8080 with default 1h duration:
   rtunnel 8080

   # Or specify custom duration:
   rtunnel create --port 8080 --duration 2h
   ```

---

## Quickstart: Render Deployment

1. Click **New Web Service** or deploy via **Blueprint** with the included `render.yaml`.
2. Configure your environment variables:
   - `ADMIN_USERNAME`: Dashboard username (e.g. `admin`)
   - `ADMIN_PASSWORD_HASH`: Bcrypt hash of your password
   - `TUNNEL_MASTER_TOKEN`: Secret token for Termux clients
3. Deploy! Your server will start on port 10000 (Render default) and provide `/health` and `/dashboard`.

---

## Documentation Index

- [Architecture Overview](docs/architecture.md)
- [Security Model & Anti-SSRF](docs/security.md)
- [WebSocket Protocol Specification](docs/protocol.md)
- [Android Termux Guide](docs/termux.md)
- [Render Deployment Guide](docs/render.md)
- [REST API Reference](docs/api.md)

---

## License

MIT License. Designed and engineered for production deployment.
