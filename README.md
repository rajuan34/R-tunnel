# R-Tunnel — Open Source HTTP/HTTPS Edge Tunneling Gateway

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage_Alpine-blue.svg)](https://www.docker.com)
[![Render](https://img.shields.io/badge/Render-Blueprint_Ready-46E3B7.svg)](https://render.com)
[![WebSockets](https://img.shields.io/badge/WebSocket-RFC_6455-orange.svg)](https://github.com/websockets/ws)
[![Tests](https://img.shields.io/badge/Tests-25%20Passed-brightgreen.svg)](tests/)

**A high-performance, personal ngrok-style tunneling service and reverse proxy engineered specifically for Android Termux and Render cloud web services.**

[Features](#-key-features) • [Architecture](#-architecture) • [Tools & Technologies](#-tools--technologies-used) • [Quick Start](#-quick-start) • [Termux Setup](#-android-termux-guide) • [User Management](#-user-management--master-keys) • [License](#-license)

</div>

---

## 📖 Overview

**R-Tunnel** allows developers, hobbyists, and field engineers to expose local HTTP servers running on smartphones (via **Android Termux**), laptops, or Raspberry Pis to the public internet through a secure HTTPS gateway.

On mobile cellular networks (4G / 5G / LTE), mobile service providers place devices behind **Carrier-Grade NAT (CGNAT)** with private non-routable IP addresses. This makes traditional inbound port forwarding impossible. R-Tunnel solves this by establishing a persistent, multiplexed **outbound WebSocket connection** (`wss://`) from the local client to the cloud edge proxy. Incoming public web traffic is packetized, routed over the existing WebSocket connection to your device, and streamed back in real-time with sub-millisecond proxy overhead.

---

## ⚡ Key Features

- **🌐 Zero-Config Render Deployment:** Native `render.yaml` Blueprint specification. Automatically detects public URLs, configures edge proxies, and includes a cold-start wake-up loop for free-tier instances.
- **📱 Android Termux First-Class:** Pure Node.js CLI client designed to run in Termux with zero native compilation dependencies, automatic exponential backoff reconnection, and background daemon support.
- **👥 Multi-User Management & Master Keys:** Provision dedicated user accounts directly from the web dashboard. Generate cryptographically secure, persistent Master Keys (`rt_master_...`) with configurable concurrent tunnel quotas, expiration, and one-click revocation.
- **🔒 Strict Anti-SSRF Protection:** The client strictly whitelists `127.0.0.1` and `localhost`. Arbitrary upstream proxying or internal subnet reconnaissance is strictly prevented.
- **🖼️ Binary Response Integrity:** Seamlessly forwards binary data (images, audio, PDF files, media downloads, websockets) using lossless Base64 payload transport.
- **⏱️ Server-Authoritative Lifetimes:** Fixed tunnel duration (`30m`, `1h`, `2h`, `3h`) and idle timers enforced strictly by the edge gateway clock.
- **📊 Real-Time Control Plane Dashboard:** Responsive dark terminal dashboard built with React 19 and Tailwind CSS. Features live request traffic inspectors, connection countdowns, real-time metrics, and instant CLI command generators.
- **🧪 100% Automated Test Coverage:** Comprehensive test suite covering cryptographic utilities, protocol serialization, SSRF guards, user management, and end-to-end WebSocket proxy tunneling.

---

## 🛠️ Tools & Technologies Used

R-Tunnel is built using modern, production-grade open source technologies across its entire stack:

### 1. Edge Server & Gateway (Backend)
- **[Node.js](https://nodejs.org/) (v20+ LTS)**: Asynchronous, event-driven JavaScript runtime executing the reverse proxy core.
- **[TypeScript](https://www.typescriptlang.org/) (v5+)**: Full static type safety across data contracts, WebSocket protocol frames, and HTTP handlers.
- **[Express.js](https://expressjs.com/) (v4)**: HTTP engine handling edge routing, reverse proxy request buffering, cookie-based session management, and REST APIs.
- **[ws](https://github.com/websockets/ws)**: High-speed, RFC 6455-compliant WebSocket server implementing bi-directional streaming, heartbeat ping-pong, and real-time dashboard broadcasts.
- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)**: Cryptographic password hashing protecting administrative accounts.
- **Node.js Native Crypto (`node:crypto`)**: Timing-safe comparison (`timingSafeEqual`) to prevent side-channel timing attacks, CSPRNG token generation (`randomBytes`), and UUID generation.
- **Atomic File Store (`data/users.json`)**: Lightweight, zero-dependency persistence layer with safe atomic write swaps and in-memory cache indexing.

### 2. Control Plane Dashboard (Frontend)
- **[React](https://react.dev/) (v19)**: Component-driven single-page application (SPA) control dashboard.
- **[Tailwind CSS](https://tailwindcss.com/)**: Utility-first CSS framework styled with a developer-focused dark cyberpunk theme, optimized for both mobile screens and desktop monitors.
- **[Lucide Icons](https://lucide.dev/)**: Clean, feather-style iconography.
- **[esbuild](https://esbuild.github.io/)**: Ultra-fast bundler and minifier, optimizing the client SPA to ~329 KB for cellular efficiency.

### 3. Client CLI (`@r-tunnel/client` / `rtunnel`)
- **Node.js CLI Engine**: Lightweight executable with zero external native bindings. Runs on Termux, Linux, macOS, and Windows.
- **Multiplexed Wire Protocol**: Custom binary and JSON protocol handling HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`), request bodies, multi-part payloads, query strings, and custom headers.
- **Edge Wake-Up Optimizer**: Proactively queries `/health` before establishing WebSockets, allowing sleeping Render containers to spin up without handshake timeout drops.

### 4. DevOps, Cloud & Containerization
- **[Docker](https://www.docker.com/)**: Multi-stage Alpine container build (`node:20-alpine`) featuring non-root security (`USER node`), integrated health checks, and dynamic `PORT` binding.
- **[Render](https://render.com/) Blueprint (`render.yaml`)**: Infrastructure-as-Code specification for automated cloud deployments with zero manual environment configuration.
- **Native Test Runner (`node:test`)**: Zero-dependency automated test execution with standard TAP/spec output reporting.

---

## 🏛️ Architecture

```text
 ┌─────────────────────────────────────────────────────────────┐
 │                     Android Termux / Client                 │
 │                                                             │
 │  ┌─────────────────────────┐     ┌───────────────────────┐  │
 │  │   Local HTTP Server     │ ◄-► │   rtunnel CLI Client  │  │
 │  │ (127.0.0.1:8080, Flask, │     │ (Anti-SSRF Validated) │  │
 │  │  Node, Next.js, Python) │     └───────────┬───────────┘  │
 └────────────────────────────┼─────────────────┼──────────────┘
                              │                 │ Persistent WSS
                              │                 │ Outbound Connection
                              │                 ▼ (CGNAT Bypass)
 ┌────────────────────────────┼────────────────────────────────┐
 │                            ▼                                │
 │             R-Tunnel Edge Server (Render / Cloud)           │
 │                                                             │
 │   ┌────────────────────────┐     ┌───────────────────────┐  │
 │   │  Client WebSocket Hub  │ ◄-► │   HTTP Reverse Proxy  │  │
 │   │  (/ws/client)          │     │   (/t/<id> or Domain) │  │
 │   └────────────────────────┘     └───────────▲───────────┘  │
 │                                              │              │
 │   ┌────────────────────────┐     ┌───────────┴───────────┐  │
 │   │ Dashboard WebSockets   │     │  Users & Master Keys  │  │
 │   │ (/ws/dashboard)        │     │  (Role & Quota Store) │  │
 │   └────────────────────────┘     └───────────────────────┘  │
 └──────────────────────────────────────────────┼──────────────┘
                                                │ Public HTTPS
                                                ▼ Traffic
                                    ┌───────────────────────┐
                                    │ Internet Web Browser  │
                                    │ or External Webhook   │
                                    └───────────────────────┘
```

---

## 🚀 Quick Start

### Option 1: One-Click Render Deployment (Cloud)

1. Fork or push this repository to your GitHub account.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint**.
3. Select your repository. Render automatically reads `render.yaml`, spins up the service on Node 20 LTS, and generates cryptographically secure secrets.
4. Your server will be live at `https://<service-name>.onrender.com`!

### Option 2: Docker Container Deployment

```bash
# Build the Docker image
docker build -t r-tunnel .

# Run the container on port 10000
docker run -d \
  -p 10000:10000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your_secure_password \
  -e TUNNEL_MASTER_TOKEN=your_master_token \
  --name r-tunnel-edge \
  r-tunnel
```

### Option 3: Local Development

```bash
# 1. Clone the repository
git clone https://github.com/rajuan/r-tunnel.git
cd r-tunnel

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env

# 4. Start the development server (runs with hot reload on port 3000)
npm run dev

# 5. Run automated test suite
npm test
```

---

## 📱 Android Termux Guide

Running R-Tunnel in Android Termux takes less than 2 minutes:

### 1. Install Node.js & Git in Termux
```bash
pkg update && pkg install nodejs git
```

### 2. Configure CLI Credentials
Run the login helper to configure your server endpoint and Master Key:
```bash
rtunnel login --server "https://your-service.onrender.com" --token "<YOUR_MASTER_KEY>"
```
*Credentials are saved securely to `~/.rtunnel/config.json`.*

### 3. Expose Your Local Server
```bash
# Expose local port 8080 with default 1-hour duration:
rtunnel 8080

# Or specify custom duration and friendly label:
rtunnel create --port 3000 --duration 2h --label "My Mobile React App"
```

Once connected, the CLI outputs your live public HTTPS URL:
```text
==================================================
       R-Tunnel — Android Termux HTTP Tunnel       
==================================================
✔ Server connected
✔ Authentication successful
✔ Tunnel active
Local:       http://127.0.0.1:8080
Public:      https://your-service.onrender.com/t/7x9k2m4a
Duration:    1.0 hours
Tunnel ID:   7x9k2m4a
Status:      CONNECTED
```

---

## 👥 User Management & Master Keys

R-Tunnel features a complete multi-user control plane built directly into the web dashboard:

1. Log into your dashboard (`/dashboard`) using your administrator credentials.
2. Navigate to the **Users & Master Keys** tab.
3. Click **Add New User**:
   - Assign a unique username (e.g. `alex_termux`, `jane_mobile`).
   - Add optional device/node notes (e.g. *"Galaxy S23 Testing Node"*).
   - Set maximum concurrent active tunnels (e.g. `5` or `0` for unlimited).
   - Configure key expiration (Permanent, 30 days, 90 days, or 1 year).
   - Select **Auto-generate secure key** or specify a custom key.
4. Click **Create User & Generate Key**.
5. The dashboard presents a **Master Key Ready** credential card with one-click copy buttons for:
   - The raw Master Key (`rt_master_...`)
   - The CLI login setup command
   - A complete formatted invitation text ready to send to your user.
6. Administrators can regenerate keys, toggle user status (Active ⇄ Suspended), edit quotas, or delete accounts at any time.

---

## 💻 CLI Command Reference

| Command | Arguments / Flags | Description |
| :--- | :--- | :--- |
| `rtunnel <port>` | `<port>` | Quick shortcut to expose a local port with default 1h duration |
| `rtunnel login` | `--server <url>`, `--token <key>` | Configure server address and Master Key in `~/.rtunnel/config.json` |
| `rtunnel create` | `--port <port>`, `--duration <30m\|1h\|2h\|3h>`, `--label <name>`, `--id <customId>` | Start an interactive tunnel session with advanced parameters |
| `rtunnel status` | none | Check local CLI configuration and active connection profile |
| `rtunnel --help` | none | Display all available CLI commands and flags |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the HTTP and WebSocket edge server (Render sets `10000`) |
| `NODE_ENV` | `development` | Runtime mode (`development` or `production`) |
| `PUBLIC_BASE_URL` | *(Auto-detected)* | Fully qualified edge URL (e.g. `https://r-tunnel.onrender.com`) |
| `PUBLIC_BASE_DOMAIN` | *(None)* | Custom wildcard domain (e.g. `tunnel.yourdomain.com`) |
| `ADMIN_USERNAME` | `admin` | Username for dashboard access |
| `ADMIN_PASSWORD` | *(None)* | Plaintext admin password (or use `ADMIN_PASSWORD_HASH`) |
| `ADMIN_PASSWORD_HASH` | *(None)* | Bcrypt password hash for production dashboard access |
| `SESSION_SECRET` | *(Auto-generated)* | Secret key for signing dashboard session cookies |
| `TUNNEL_MASTER_TOKEN` | *(Auto-generated)* | Global fallback client token |
| `MAX_ACTIVE_TUNNELS` | `10` | Maximum number of concurrent active tunnels server-wide |
| `MAX_REQUESTS_PER_MINUTE` | `120` | Rate limit threshold per IP for abuse prevention |
| `KEEP_ALIVE` | `false` | Enables 12-minute `/health` ping loop to prevent free-tier container sleep |

---

## 📄 License

This project is open source and available under the terms of the **[Apache License, Version 2.0](LICENSE)**.

```text
Copyright 2026 RAJUAN and R-Tunnel Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

<div align="center">
  <sub>Created & Maintained by <a href="https://RAJUAN.is-a.dev">RAJUAN</a>. Made with dedication for the open source developer community.</sub>
</div>
