# Deploying R-Tunnel to Render Web Services

This guide explains how to deploy R-Tunnel to Render Web Services on the free or standard plan.

---

## 1. Quick Deploy via Render Blueprint

R-Tunnel includes a pre-configured `render.yaml` file in the root of the repository:

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository containing R-Tunnel.
4. Render will read `render.yaml` and configure the Web Service automatically.

---

## 2. Manual Web Service Setup (Alternative)

If setting up manually:
- **Service Type:** Web Service
- **Runtime:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Plan:** Free or Starter

---

## 3. Environment Variables Configuration

Set these environment variables in your Render Web Service settings:

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Render internal port (injected automatically by Render) | `10000` |
| `PUBLIC_BASE_URL` | Public HTTPS URL of the service | `https://r-tunnel.onrender.com` |
| `PUBLIC_BASE_DOMAIN` | Optional wildcard domain (if using `*.domain.com`) | `tunnel.example.com` (leave blank for path mode `/t/:id`) |
| `ADMIN_USERNAME` | Dashboard username | `admin` |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash for admin password | Run `node -e 'console.log(require("bcryptjs").hashSync("YourPassword", 10))'` |
| `TUNNEL_MASTER_TOKEN` | Secret token used by Termux clients | `rt_master_sec789abcdef` |
| `MAX_ACTIVE_TUNNELS` | Maximum concurrent tunnels allowed | `5` |
| `MAX_REQUESTS_PER_MINUTE` | Rate limit per tunnel/IP | `120` |
| `MAX_BODY_SIZE` | Max buffered request body size | `10mb` |
| `DEFAULT_TUNNEL_DURATION` | Default lifetime | `1h` |
| `MAX_TUNNEL_DURATION` | Maximum allowable lifetime | `3h` |

---

## 4. Render Free Plan Considerations & Instance Restarts

- **Cold Starts & Sleep:** Render free Web Services spin down after 15 minutes of inactivity. When a public user visits a tunnel, Render will spin the container back up.
- **WebSocket Reconnection:** When Render replaces an instance or restarts a container, active WebSocket connections will drop. The `rtunnel` Termux client has automatic exponential backoff reconnection (`1s, 2s, 4s, 8s, 16s, 30s`) and will automatically re-establish the connection.
- **In-Memory State Notice:** On the initial version, active tunnel state is stored in memory. When a Render container restarts, previously active tunnels must be re-registered by running `rtunnel` again.
