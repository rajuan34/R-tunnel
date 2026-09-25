# R-Tunnel Android Termux User Guide

This guide walks through configuring and running R-Tunnel on an Android device running Termux.

---

## 1. Prerequisites in Termux

Open Termux on Android and run:

```bash
# Update Termux packages
pkg update -y

# Install Node.js runtime and git
pkg install -y nodejs git
```

Verify Node.js version (v18 or higher recommended):
```bash
node -v
```

---

## 2. Installation

You can install the client using the automated installer:

```bash
git clone https://github.com/rajuan/r-tunnel.git
cd r-tunnel/client
chmod +x install.sh
./install.sh
```

This installs the `rtunnel` executable into Termux's `$PREFIX/bin` or `~/.local/bin`, making the command accessible anywhere in your shell.

---

## 3. Initial Configuration (`login`)

Run:
```bash
rtunnel login
```

You will be prompted for:
1. **Server URL:** Your deployed Render server URL (e.g., `https://r-tunnel.onrender.com`).
2. **Authentication Token:** The `TUNNEL_MASTER_TOKEN` configured in your Render environment variables or an ephemeral client token generated from the admin dashboard.

The credentials are saved to `~/.rtunnel/config.json` with restrictive `0600` permissions.

---

## 4. Usage Examples

### Expose a local port (e.g. 8080)
```bash
rtunnel 8080
```

### Expose with custom duration
Supported durations: `30m`, `1h`, `2h`, `3h`.
```bash
rtunnel create --port 8080 --duration 2h
```

### Expose a Python HTTP server in Termux
Terminal 1 (Run local server):
```bash
python -m http.server 8080
```

Terminal 2 (Expose via R-Tunnel):
```bash
rtunnel 8080
```

Terminal Output:
```text
==================================================
       R-Tunnel — Android Termux HTTP Tunnel       
==================================================
✔ Server connected
✔ Authentication successful
✔ Tunnel active

  Local:       http://127.0.0.1:8080
  Public:      https://r-tunnel.onrender.com/t/x7k29m4p
  Duration:    1.0 hours
  Tunnel ID:   x7k29m4p
  Status:      CONNECTED

  Press Ctrl+C to stop tunnel gracefully.
--------------------------------------------------
Live HTTP Requests:

  GET     /                                    200      18ms
  GET     /style.css                           200       8ms
  POST    /api/submit                          200      32ms
```

---

## 5. Graceful Stop (Ctrl+C)

When you press `Ctrl+C`:
1. `rtunnel` sends a `disconnect` message to the Render server.
2. The Render server terminates the tunnel and marks it expired.
3. The WebSocket connection closes cleanly without leaving orphaned state on the server.
