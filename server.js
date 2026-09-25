// server/src/server.ts
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer as WebSocketServer2 } from "ws";
import cookieParser from "cookie-parser";
import cors from "cors";

// server/src/config.ts
import dotenv from "dotenv";
dotenv.config();
function parseBytes(value, defaultValue) {
  if (!value) return defaultValue;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) return defaultValue;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "b").toLowerCase();
  switch (unit) {
    case "kb":
      return Math.round(num * 1024);
    case "mb":
      return Math.round(num * 1024 * 1024);
    case "gb":
      return Math.round(num * 1024 * 1024 * 1024);
    default:
      return Math.round(num);
  }
}
function parseDurationSeconds(value, defaultValue) {
  if (!value) return defaultValue;
  const match = value.trim().match(/^(\d+)\s*(s|m|h|d)?$/i);
  if (!match) return defaultValue;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || "s").toLowerCase();
  switch (unit) {
    case "m":
      return num * 60;
    case "h":
      return num * 3600;
    case "d":
      return num * 86400;
    default:
      return num;
  }
}
var config = {
  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  // Use port 3000 for local/AI Studio dev, fallback to PORT env (Render sets PORT e.g. 10000)
  port: Number(process.env.PORT || 3e3),
  host: "0.0.0.0",
  // Public domain and URL resolution
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "",
  publicBaseDomain: (process.env.PUBLIC_BASE_DOMAIN || "").trim().toLowerCase(),
  // Authentication
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  tunnelMasterToken: process.env.TUNNEL_MASTER_TOKEN || "",
  sessionSecret: process.env.SESSION_SECRET || "r-tunnel-default-session-secret-change-in-prod",
  // Limits
  maxActiveTunnels: parseInt(process.env.MAX_ACTIVE_TUNNELS || "10", 10),
  maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || "120", 10),
  maxBodySize: parseBytes(process.env.MAX_BODY_SIZE, 10 * 1024 * 1024),
  // 10MB
  maxWsMessageSize: parseBytes(process.env.MAX_WS_MESSAGE_SIZE, 12 * 1024 * 1024),
  // 12MB
  // Durations & Timeouts
  defaultTunnelDuration: parseDurationSeconds(process.env.DEFAULT_TUNNEL_DURATION, 3600),
  // 1 hour
  maxTunnelDuration: parseDurationSeconds(process.env.MAX_TUNNEL_DURATION, 10800),
  // 3 hours
  idleTimeoutMinutes: parseInt(process.env.IDLE_TIMEOUT_MINUTES || "0", 10),
  // 0 = disabled
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10),
  // 30s
  // Logging
  logLevel: (process.env.LOG_LEVEL || "info").toLowerCase()
};

// server/src/logging/logger.ts
var LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "mastertoken",
  "password",
  "secret",
  "api-key",
  "apikey",
  "adminpasswordhash"
]);
function sanitizeData(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
var Logger = class {
  currentPriority;
  constructor() {
    const configuredLevel = config.logLevel || "info";
    this.currentPriority = LOG_LEVEL_PRIORITY[configuredLevel] ?? 1;
  }
  shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= this.currentPriority;
  }
  formatMessage(level, event, meta) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const cleanMeta = meta ? sanitizeData(meta) : void 0;
    const metaStr = cleanMeta ? ` ${JSON.stringify(cleanMeta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${event}${metaStr}`;
  }
  debug(event, meta) {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", event, meta));
    }
  }
  info(event, meta) {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", event, meta));
    }
  }
  warn(event, meta) {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", event, meta));
    }
  }
  error(event, meta) {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", event, meta));
    }
  }
};
var logger = new Logger();

// server/src/tunnels/tunnel.store.ts
var MemoryTunnelStore = class {
  tunnels = /* @__PURE__ */ new Map();
  activityLog = [];
  maxActivityEntries = 1e3;
  async get(id) {
    return this.tunnels.get(id) || null;
  }
  async set(record) {
    this.tunnels.set(record.id, { ...record });
  }
  async delete(id) {
    return this.tunnels.delete(id);
  }
  async getAll() {
    return Array.from(this.tunnels.values());
  }
  async getActive() {
    const now = Date.now();
    return Array.from(this.tunnels.values()).filter(
      (t) => t.status !== "expired" && t.expiresAt > now
    );
  }
  async recordActivity(entry) {
    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivityEntries) {
      this.activityLog.pop();
    }
  }
  async getActivity(limit = 100) {
    return this.activityLog.slice(0, limit);
  }
};
var tunnelStore = new MemoryTunnelStore();

// server/src/tunnels/tunnel.manager.ts
import { WebSocket as WebSocket2 } from "ws";

// server/src/utils/crypto.ts
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
var TUNNEL_ID_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";
function generateTunnelId(length = 8) {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += TUNNEL_ID_CHARS[bytes[i] % TUNNEL_ID_CHARS.length];
  }
  return result;
}
function generateSecureToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("hex");
}
function generateRequestId() {
  return crypto.randomUUID();
}
async function verifyPassword(plainText, hash) {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}
function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// server/src/utils/helpers.ts
function getBaseUrl(req) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/+$/, "");
  }
  if (config.renderExternalUrl) {
    return config.renderExternalUrl.replace(/\/+$/, "");
  }
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${config.port}`;
    return `${proto}://${host}`;
  }
  return `http://localhost:${config.port}`;
}
function buildPublicUrl(tunnelId, req) {
  if (config.publicBaseDomain) {
    const proto = req ? req.headers["x-forwarded-proto"] || req.protocol || "https" : "https";
    return `${proto}://${tunnelId}.${config.publicBaseDomain}`;
  }
  const base = getBaseUrl(req);
  return `${base}/t/${tunnelId}`;
}
function extractTunnelIdFromHost(hostname) {
  if (!config.publicBaseDomain) return null;
  const cleanHost = hostname.split(":")[0].toLowerCase();
  const domain = config.publicBaseDomain.toLowerCase();
  if (cleanHost.endsWith(`.${domain}`)) {
    const sub = cleanHost.slice(0, -(domain.length + 1));
    if (/^[a-z0-9]{6,32}$/.test(sub)) {
      return sub;
    }
  }
  return null;
}

// server/src/security/ssrf.ts
function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
function validateTunnelRequest(params) {
  if (!isValidPort(params.port)) {
    return { valid: false, error: "Invalid port. Port must be between 1 and 65535." };
  }
  if (params.durationSeconds !== void 0) {
    if (params.durationSeconds < 60) {
      return { valid: false, error: "Duration must be at least 1 minute (60s)." };
    }
    if (params.durationSeconds > params.maxDuration) {
      return {
        valid: false,
        error: `Duration exceeds maximum allowed lifetime of ${params.maxDuration / 3600} hours.`
      };
    }
  }
  return { valid: true };
}

// server/src/websocket/protocol.ts
function createMessage(type, payload, tunnelId, requestId) {
  return {
    type,
    requestId,
    tunnelId,
    timestamp: Date.now(),
    payload
  };
}
function serializeMessage(msg) {
  return JSON.stringify(msg);
}
function parseMessage(data) {
  try {
    const raw = typeof data === "string" ? data : data.toString("utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.type) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// server/src/websocket/dashboard.ws.ts
import { WebSocket } from "ws";
var DashboardWsManager = class {
  clients = /* @__PURE__ */ new Set();
  handleConnection(ws, req) {
    this.clients.add(ws);
    logger.debug("Dashboard client connected", { total: this.clients.size });
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25e3);
    ws.on("close", () => {
      clearInterval(pingInterval);
      this.clients.delete(ws);
      logger.debug("Dashboard client disconnected", { total: this.clients.size });
    });
    ws.on("error", (err) => {
      logger.warn("Dashboard WS error", { error: err.message });
      clearInterval(pingInterval);
      this.clients.delete(ws);
    });
  }
  broadcast(event, data) {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          logger.warn("Failed to send to dashboard client", { err });
        }
      }
    }
  }
  getConnectedCount() {
    return this.clients.size;
  }
};
var dashboardWsManager = new DashboardWsManager();

// server/src/tunnels/tunnel.manager.ts
var TunnelManager = class {
  store;
  clientSockets = /* @__PURE__ */ new Map();
  // tunnelId -> WebSocket
  pendingRequests = /* @__PURE__ */ new Map();
  // requestId -> PendingRequest
  warnedExpiring = /* @__PURE__ */ new Set();
  // tunnelIds warned
  startTime = Date.now();
  constructor(store = tunnelStore) {
    this.store = store;
    setInterval(() => this.monitorTunnels(), 5e3).unref();
  }
  /**
   * Creates a new tunnel record.
   */
  async createTunnel(options) {
    const active = await this.store.getActive();
    if (active.length >= config.maxActiveTunnels) {
      return {
        tunnel: null,
        error: `Active tunnel limit reached (${config.maxActiveTunnels}). Please wait or stop an existing tunnel.`
      };
    }
    const duration = options.durationSeconds || config.defaultTunnelDuration;
    const validation = validateTunnelRequest({
      port: options.port,
      durationSeconds: duration,
      maxDuration: config.maxTunnelDuration
    });
    if (!validation.valid) {
      return { tunnel: null, error: validation.error };
    }
    let tunnelId = options.customTunnelId ? options.customTunnelId.toLowerCase() : generateTunnelId(8);
    let existing = await this.store.get(tunnelId);
    let attempts = 0;
    while (existing && attempts < 5) {
      tunnelId = generateTunnelId(8);
      existing = await this.store.get(tunnelId);
      attempts++;
    }
    const now = Date.now();
    const publicUrl = buildPublicUrl(tunnelId);
    const tunnel = {
      id: tunnelId,
      localPort: options.port,
      label: options.label || `Port ${options.port}`,
      createdAt: now,
      expiresAt: now + duration * 1e3,
      durationSeconds: duration,
      lastActivity: now,
      status: "connecting",
      publicUrl,
      requestCount: 0,
      bytesIn: 0,
      bytesOut: 0,
      clientIp: options.clientIp,
      clientId: options.clientId
    };
    await this.store.set(tunnel);
    logger.info("Tunnel created", { tunnelId, port: options.port, durationSeconds: duration });
    dashboardWsManager.broadcast("tunnel_created", tunnel);
    return { tunnel };
  }
  /**
   * Binds a connected WebSocket client to a tunnel.
   */
  async bindClientConnection(tunnelId, ws, clientIp) {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) return false;
    if (tunnel.status === "expired") return false;
    const existing = this.clientSockets.get(tunnelId);
    if (existing && existing !== ws && existing.readyState === WebSocket2.OPEN) {
      try {
        existing.send(
          serializeMessage(
            createMessage("tunnel_expired", {
              reason: "manual",
              message: "New client connection established for this tunnel."
            }, tunnelId)
          )
        );
        existing.close();
      } catch {
      }
    }
    this.clientSockets.set(tunnelId, ws);
    tunnel.status = "connected";
    tunnel.lastActivity = Date.now();
    if (clientIp) tunnel.clientIp = clientIp;
    await this.store.set(tunnel);
    logger.info("Client bound to tunnel", { tunnelId, clientIp });
    dashboardWsManager.broadcast("tunnel_updated", tunnel);
    return true;
  }
  /**
   * Handles client WebSocket disconnect.
   */
  async handleClientDisconnect(tunnelId, ws) {
    const currentWs = this.clientSockets.get(tunnelId);
    if (ws && currentWs !== ws) {
      return;
    }
    this.clientSockets.delete(tunnelId);
    for (const [reqId, pending] of this.pendingRequests.entries()) {
      if (pending.tunnelId === tunnelId) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(reqId);
        pending.reject(new Error("Tunnel client disconnected while processing request"));
      }
    }
    const tunnel = await this.store.get(tunnelId);
    if (tunnel && tunnel.status !== "expired") {
      tunnel.status = "disconnected";
      await this.store.set(tunnel);
      logger.info("Tunnel client disconnected", { tunnelId });
      dashboardWsManager.broadcast("tunnel_updated", tunnel);
    }
  }
  /**
   * Dispatches an HTTP request to the connected Termux client via WebSocket.
   */
  async dispatchHttpRequest(tunnelId, reqPayload, timeoutMs = config.requestTimeoutMs) {
    const ws = this.clientSockets.get(tunnelId);
    if (!ws || ws.readyState !== WebSocket2.OPEN) {
      throw new Error("Tunnel client is offline or disconnected");
    }
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel || tunnel.status === "expired") {
      throw new Error("Tunnel is expired or no longer available");
    }
    const now = Date.now();
    tunnel.lastActivity = now;
    tunnel.requestCount += 1;
    if (reqPayload.body) {
      tunnel.bytesIn += reqPayload.isBase64 ? Buffer.from(reqPayload.body, "base64").length : Buffer.byteLength(reqPayload.body, "utf-8");
    }
    await this.store.set(tunnel);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqPayload.requestId);
        reject(new Error(`Tunnel request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRequests.set(reqPayload.requestId, {
        resolve,
        reject,
        timer,
        startTime: Date.now(),
        tunnelId
      });
      const message = createMessage("http_request", reqPayload, tunnelId, reqPayload.requestId);
      try {
        ws.send(serializeMessage(message));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqPayload.requestId);
        reject(new Error(`Failed to transmit request to tunnel client: ${err.message}`));
      }
    });
  }
  /**
   * Handles incoming HTTP response from the Termux client.
   */
  async handleHttpResponse(resPayload, tunnelId) {
    const pending = this.pendingRequests.get(resPayload.requestId);
    if (!pending) {
      logger.warn("Received response for unknown or timed out request", {
        requestId: resPayload.requestId
      });
      return;
    }
    clearTimeout(pending.timer);
    this.pendingRequests.delete(resPayload.requestId);
    resPayload.durationMs = Date.now() - pending.startTime;
    if (pending.tunnelId) {
      const tunnel = await this.store.get(pending.tunnelId);
      if (tunnel) {
        if (resPayload.body) {
          const resBytes = resPayload.isBase64 ? Buffer.from(resPayload.body, "base64").length : Buffer.byteLength(resPayload.body, "utf-8");
          tunnel.bytesOut += resBytes;
        }
        await this.store.set(tunnel);
      }
    }
    pending.resolve(resPayload);
  }
  /**
   * Extends an active tunnel's duration.
   */
  async extendTunnel(tunnelId, additionalSeconds) {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) {
      return { success: false, error: "Tunnel not found" };
    }
    if (tunnel.status === "expired") {
      return { success: false, error: "Cannot extend an expired tunnel" };
    }
    const maxAllowedExpiresAt = tunnel.createdAt + config.maxTunnelDuration * 1e3;
    const newExpiresAt = tunnel.expiresAt + additionalSeconds * 1e3;
    if (newExpiresAt > maxAllowedExpiresAt) {
      return {
        success: false,
        error: `Extension would exceed maximum tunnel lifetime of ${config.maxTunnelDuration / 3600} hours.`
      };
    }
    tunnel.expiresAt = newExpiresAt;
    tunnel.durationSeconds += additionalSeconds;
    if (tunnel.status === "expiring") {
      tunnel.status = "connected";
    }
    this.warnedExpiring.delete(tunnelId);
    await this.store.set(tunnel);
    logger.info("Tunnel extended", { tunnelId, additionalSeconds, newExpiresAt });
    dashboardWsManager.broadcast("tunnel_updated", tunnel);
    const ws = this.clientSockets.get(tunnelId);
    if (ws && ws.readyState === WebSocket2.OPEN) {
      try {
        ws.send(
          serializeMessage(
            createMessage(
              "tunnel_expiring",
              {
                remainingSeconds: Math.max(0, Math.floor((tunnel.expiresAt - Date.now()) / 1e3)),
                expiresAt: tunnel.expiresAt
              },
              tunnelId
            )
          )
        );
      } catch {
      }
    }
    return { success: true, tunnel };
  }
  /**
   * Stops and expires a tunnel immediately.
   */
  async stopTunnel(tunnelId, reason = "manual") {
    const tunnel = await this.store.get(tunnelId);
    if (!tunnel) return false;
    tunnel.status = "expired";
    await this.store.set(tunnel);
    const ws = this.clientSockets.get(tunnelId);
    if (ws) {
      try {
        if (ws.readyState === WebSocket2.OPEN) {
          ws.send(
            serializeMessage(
              createMessage(
                "tunnel_expired",
                {
                  reason,
                  message: `Tunnel ${tunnelId} has been stopped (${reason}).`
                },
                tunnelId
              )
            )
          );
          ws.close();
        }
      } catch {
      }
      this.clientSockets.delete(tunnelId);
    }
    logger.info("Tunnel stopped", { tunnelId, reason });
    dashboardWsManager.broadcast("tunnel_expired", { tunnelId, reason });
    return true;
  }
  /**
   * Periodically monitors expiration and idle timeouts.
   */
  async monitorTunnels() {
    const now = Date.now();
    const active = await this.store.getActive();
    for (const tunnel of active) {
      if (now >= tunnel.expiresAt) {
        await this.stopTunnel(tunnel.id, "timeout");
        continue;
      }
      if (config.idleTimeoutMinutes > 0) {
        const idleMs = now - tunnel.lastActivity;
        const maxIdleMs = config.idleTimeoutMinutes * 60 * 1e3;
        if (idleMs > maxIdleMs) {
          await this.stopTunnel(tunnel.id, "idle");
          continue;
        }
      }
      const remainingSeconds = Math.floor((tunnel.expiresAt - now) / 1e3);
      if (remainingSeconds <= 300 && !this.warnedExpiring.has(tunnel.id)) {
        this.warnedExpiring.add(tunnel.id);
        tunnel.status = "expiring";
        await this.store.set(tunnel);
        dashboardWsManager.broadcast("tunnel_updated", tunnel);
        const ws = this.clientSockets.get(tunnel.id);
        if (ws && ws.readyState === WebSocket2.OPEN) {
          try {
            ws.send(
              serializeMessage(
                createMessage(
                  "tunnel_expiring",
                  { remainingSeconds, expiresAt: tunnel.expiresAt },
                  tunnel.id
                )
              )
            );
          } catch {
          }
        }
      }
    }
  }
  /**
   * Get system-wide statistics for the dashboard.
   */
  async getSystemStats() {
    const all = await this.store.getAll();
    const now = Date.now();
    let totalRequests = 0;
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let activeTunnels = 0;
    for (const t of all) {
      totalRequests += t.requestCount;
      totalBytesIn += t.bytesIn;
      totalBytesOut += t.bytesOut;
      if (t.status !== "expired" && t.expiresAt > now) {
        activeTunnels++;
      }
    }
    return {
      activeTunnels,
      totalRequests,
      totalBytesIn,
      totalBytesOut,
      connectedClients: this.clientSockets.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1e3),
      serverTime: Date.now()
    };
  }
  isClientConnected(tunnelId) {
    const ws = this.clientSockets.get(tunnelId);
    return !!ws && ws.readyState === WebSocket2.OPEN;
  }
};
var tunnelManager = new TunnelManager();

// server/src/security/rate-limiter.ts
var SimpleRateLimiter = class {
  limits = /* @__PURE__ */ new Map();
  windowMs;
  maxRequests;
  constructor(windowMs = 6e4, maxRequests = 120) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    setInterval(() => this.cleanup(), Math.max(windowMs, 3e4)).unref();
  }
  isAllowed(key) {
    const now = Date.now();
    const entry = this.limits.get(key);
    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.limits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }
    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }
    entry.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt
    };
  }
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetAt <= now) {
        this.limits.delete(key);
      }
    }
  }
};

// server/src/http/proxy.router.ts
var proxyLimiter = new SimpleRateLimiter(6e4, config.maxRequestsPerMinute);
var HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
function renderErrorPage(res, statusCode, title, message, reasonDetails) {
  const acceptsHtml = res.req.accepts("html");
  if (!acceptsHtml) {
    res.status(statusCode).json({
      error: title,
      message,
      statusCode,
      details: reasonDetails
    });
    return;
  }
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusCode} - ${title} | R-Tunnel</title>
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; max-width: 520px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
    .badge-error { background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .badge-expired { background: rgba(210, 153, 34, 0.15); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
    h1 { margin: 0 0 12px 0; font-size: 24px; color: #f0f6fc; font-weight: 600; }
    p { margin: 0 0 16px 0; line-height: 1.6; color: #8b949e; font-size: 14px; }
    .details { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-family: monospace; font-size: 13px; color: #79c0ff; }
    .btn { display: inline-block; background: #238636; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 12px; }
    .btn:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge ${statusCode === 410 ? "badge-expired" : "badge-error"}">${statusCode} ${statusCode === 410 ? "EXPIRED" : "ERROR"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${reasonDetails ? `<div class="details">${reasonDetails}</div>` : ""}
    <p style="font-size: 12px; color: #6e7681; margin-top: 20px;">
      Powered by <strong>R-Tunnel</strong> \u2014 Temporary HTTP/HTTPS Tunneling Service
    </p>
    <a href="/dashboard" class="btn">Go to Dashboard</a>
  </div>
</body>
</html>`;
  res.status(statusCode).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
}
async function handleTunnelProxy(req, res, tunnelId, targetPath) {
  const startTime = Date.now();
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const rateKey = `proxy:${clientIp}:${tunnelId}`;
  const rateCheck = proxyLimiter.isAllowed(rateKey);
  if (!rateCheck.allowed) {
    renderErrorPage(
      res,
      429,
      "Rate Limit Exceeded",
      "This tunnel has received too many requests in a short period. Please try again shortly.",
      `Max requests: ${config.maxRequestsPerMinute}/min`
    );
    return;
  }
  const tunnel = await tunnelStore.get(tunnelId);
  if (!tunnel) {
    renderErrorPage(
      res,
      404,
      "Tunnel Not Found",
      "The requested tunnel ID does not exist on this server. Check your URL or create a new tunnel.",
      `Tunnel ID: ${tunnelId}`
    );
    return;
  }
  if (tunnel.status === "expired" || Date.now() >= tunnel.expiresAt) {
    renderErrorPage(
      res,
      410,
      "Tunnel Expired",
      "This tunnel is no longer active. It has reached its expiration time or was closed by the user.",
      "Possible reasons: duration expired, client disconnected, or manual stop."
    );
    return;
  }
  if (!tunnelManager.isClientConnected(tunnelId)) {
    renderErrorPage(
      res,
      502,
      "Tunnel Offline",
      "The Termux client for this tunnel is currently disconnected. Make sure the rtunnel command is running on your Android device.",
      `Target: 127.0.0.1:${tunnel.localPort}`
    );
    return;
  }
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > config.maxBodySize) {
    renderErrorPage(
      res,
      413,
      "Payload Too Large",
      `Request body exceeds the maximum permitted size of ${Math.round(config.maxBodySize / (1024 * 1024))}MB.`,
      `Size: ${contentLength} bytes (Max: ${config.maxBodySize} bytes)`
    );
    return;
  }
  let bodyBuffer = null;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
    try {
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
          total += chunk.length;
          if (total > config.maxBodySize) {
            reject(new Error("Payload too large"));
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", (err) => reject(err));
      });
    } catch (err) {
      renderErrorPage(res, 413, "Payload Too Large", "Request body exceeded maximum allowed size.");
      return;
    }
  }
  const forwardHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && lower !== "host") {
      forwardHeaders[k] = v;
    }
  }
  forwardHeaders["host"] = `127.0.0.1:${tunnel.localPort}`;
  forwardHeaders["x-forwarded-for"] = clientIp;
  forwardHeaders["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || req.protocol || "https";
  forwardHeaders["x-tunnel-id"] = tunnelId;
  const requestId = generateRequestId();
  const isBinaryRequest = Boolean(bodyBuffer && bodyBuffer.length > 0);
  const reqPayload = {
    requestId,
    method: req.method,
    path: targetPath || "/",
    query: req.query,
    headers: forwardHeaders,
    body: bodyBuffer ? bodyBuffer.toString("base64") : void 0,
    isBase64: isBinaryRequest
  };
  try {
    const responsePayload = await tunnelManager.dispatchHttpRequest(
      tunnelId,
      reqPayload,
      config.requestTimeoutMs
    );
    const latencyMs = Date.now() - startTime;
    res.status(responsePayload.statusCode || 200);
    let responseSizeBytes = 0;
    if (responsePayload.headers) {
      for (const [key, value] of Object.entries(responsePayload.headers)) {
        if (value !== void 0 && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }
    }
    res.setHeader("X-Tunnel-Id", tunnelId);
    res.setHeader("X-Tunnel-Latency", `${latencyMs}ms`);
    if (responsePayload.body) {
      if (responsePayload.isBase64) {
        const buf = Buffer.from(responsePayload.body, "base64");
        responseSizeBytes = buf.length;
        res.end(buf);
      } else {
        responseSizeBytes = Buffer.byteLength(responsePayload.body, "utf-8");
        res.end(responsePayload.body);
      }
    } else {
      res.end();
    }
    const activityEntry = {
      id: requestId,
      timestamp: Date.now(),
      tunnelId,
      method: req.method,
      path: targetPath || "/",
      statusCode: responsePayload.statusCode || 200,
      latencyMs,
      requestSizeBytes: bodyBuffer ? bodyBuffer.length : 0,
      responseSizeBytes,
      clientIp
    };
    await tunnelStore.recordActivity(activityEntry);
    dashboardWsManager.broadcast("activity_logged", activityEntry);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    logger.warn("Error proxying request to tunnel", {
      tunnelId,
      path: targetPath,
      error: err.message
    });
    renderErrorPage(
      res,
      504,
      "Gateway Timeout",
      `Error communicating with local server: ${err.message}`,
      `Request ID: ${requestId}`
    );
  }
}
async function proxyMiddleware(req, res, next) {
  const host = req.headers.host || "";
  const subdomainTunnelId = extractTunnelIdFromHost(host);
  if (subdomainTunnelId) {
    await handleTunnelProxy(req, res, subdomainTunnelId, req.url);
    return;
  }
  const pathMatch = req.url.match(/^\/t\/([a-z0-9]{6,32})(\/.*)?$/i);
  if (pathMatch) {
    const tunnelId = pathMatch[1].toLowerCase();
    const targetPath = pathMatch[2] || "/";
    await handleTunnelProxy(req, res, tunnelId, targetPath);
    return;
  }
  next();
}

// server/src/http/api.router.ts
import { Router } from "express";

// server/src/auth/auth.service.ts
var AuthService = class {
  sessions = /* @__PURE__ */ new Map();
  clientTokens = /* @__PURE__ */ new Map();
  sessionTtlMs = 24 * 60 * 60 * 1e3;
  // 24 hours
  constructor() {
    setInterval(() => this.cleanup(), 6e4).unref();
  }
  /**
   * Verify admin credentials.
   */
  async verifyAdmin(username, passwordPlain) {
    if (!username || !passwordPlain) return false;
    if (username !== config.adminUsername) return false;
    if (config.adminPassword) {
      return timingSafeEqual(passwordPlain, config.adminPassword);
    }
    if (config.adminPasswordHash) {
      try {
        return await verifyPassword(passwordPlain, config.adminPasswordHash);
      } catch (err) {
        logger.error("Error verifying admin password hash", { err });
        return false;
      }
    }
    if (!config.isProduction) {
      logger.warn("Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set. Allowing dev login (admin/admin).");
      return passwordPlain === "admin";
    }
    logger.error("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required in production environment");
    return false;
  }
  /**
   * Create an admin session after successful login.
   */
  createSession(username) {
    const token = generateSecureToken(32);
    const csrfToken = generateSecureToken(24);
    const now = Date.now();
    const session = {
      token,
      username,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      csrfToken
    };
    this.sessions.set(token, session);
    return session;
  }
  /**
   * Validate an existing admin session.
   */
  validateSession(token) {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }
  /**
   * Destroy an admin session (logout).
   */
  destroySession(token) {
    return this.sessions.delete(token);
  }
  /**
   * Verify a Termux client token.
   * Can be either the server's TUNNEL_MASTER_TOKEN or an ephemeral client token.
   */
  verifyClientToken(token) {
    if (!token) return false;
    if (config.tunnelMasterToken && timingSafeEqual(token, config.tunnelMasterToken)) {
      return true;
    }
    const clientToken = this.clientTokens.get(token);
    if (clientToken) {
      if (Date.now() <= clientToken.expiresAt) {
        return true;
      }
      this.clientTokens.delete(token);
    }
    if (!config.isProduction && !config.tunnelMasterToken && token === "dev-tunnel-token") {
      return true;
    }
    return false;
  }
  /**
   * Create a short-lived client token (used by Dashboard Command Generator).
   */
  createEphemeralClientToken(durationSeconds = 86400, label) {
    const token = `rt_${generateSecureToken(24)}`;
    const now = Date.now();
    this.clientTokens.set(token, {
      token,
      label,
      createdAt: now,
      expiresAt: now + durationSeconds * 1e3
    });
    return token;
  }
  cleanup() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
    for (const [token, clientToken] of this.clientTokens.entries()) {
      if (now > clientToken.expiresAt) {
        this.clientTokens.delete(token);
      }
    }
  }
};
var authService = new AuthService();

// server/src/auth/auth.middleware.ts
var loginLimiter = new SimpleRateLimiter(6e4, 10);
function adminLoginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const check = loginLimiter.isAllowed(`login:${ip}`);
  if (!check.allowed) {
    res.status(429).json({
      error: "Too many login attempts. Please wait a minute and try again.",
      resetAt: check.resetAt
    });
    return;
  }
  next();
}
function requireAdminAuth(req, res, next) {
  let token = req.cookies?.rt_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }
  if (!token) {
    res.status(401).json({ error: "Unauthorized. Authentication session required." });
    return;
  }
  const session = authService.validateSession(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized. Session expired or invalid." });
    return;
  }
  req.adminSession = session;
  next();
}
function requireCsrf(req, res, next) {
  const safeMethods = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
  if (safeMethods.has(req.method.toUpperCase())) {
    return next();
  }
  const session = req.adminSession;
  if (!session) {
    res.status(403).json({ error: "CSRF validation failed: No session." });
    return;
  }
  const clientCsrf = req.headers["x-csrf-token"];
  if (!clientCsrf || clientCsrf !== session.csrfToken) {
    res.status(403).json({ error: "CSRF token missing or mismatch." });
    return;
  }
  next();
}

// server/src/http/api.router.ts
var apiRouter = Router();
apiRouter.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});
apiRouter.post("/api/auth/login", adminLoginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const isValid = await authService.verifyAdmin(username, password);
  if (!isValid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const session = authService.createSession(username);
  res.cookie("rt_session", session.token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1e3
  });
  res.json({
    success: true,
    user: { username: session.username },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  });
});
apiRouter.post("/api/auth/logout", (req, res) => {
  const token = req.cookies?.rt_session;
  if (token) {
    authService.destroySession(token);
  }
  res.clearCookie("rt_session");
  res.json({ success: true, message: "Logged out successfully" });
});
apiRouter.get("/api/auth/me", (req, res) => {
  let token = req.cookies?.rt_session;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }
  if (!token) {
    res.json({ authenticated: false });
    return;
  }
  const session = authService.validateSession(token);
  if (!session) {
    res.clearCookie("rt_session");
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    user: { username: session.username },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  });
});
apiRouter.use("/api", requireAdminAuth);
apiRouter.get("/api/tunnels", async (req, res) => {
  const tunnels = await tunnelStore.getAll();
  tunnels.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ tunnels });
});
apiRouter.post("/api/tunnels", requireCsrf, async (req, res) => {
  const { port, duration, label } = req.body || {};
  const localPort = parseInt(port, 10);
  if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
    res.status(400).json({ error: "Port must be a valid integer between 1 and 65535" });
    return;
  }
  let durationSeconds = config.defaultTunnelDuration;
  if (duration) {
    const parsed = parseInt(duration, 10);
    if (!isNaN(parsed) && parsed > 0) {
      durationSeconds = parsed;
    }
  }
  const { tunnel, error } = await tunnelManager.createTunnel({
    port: localPort,
    durationSeconds,
    label: label?.trim() || `Port ${localPort}`,
    clientIp: req.ip
  });
  if (error || !tunnel) {
    res.status(400).json({ error: error || "Failed to create tunnel" });
    return;
  }
  const clientToken = authService.createEphemeralClientToken(durationSeconds * 2, `tunnel-${tunnel.id}`);
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const serverUrl = config.publicBaseUrl || `${proto}://${host}`;
  const cliCommand = `rtunnel create --server "${serverUrl}" --token "${clientToken}" --port ${tunnel.localPort} --id ${tunnel.id}`;
  res.status(201).json({
    tunnel,
    clientToken,
    cliCommand
  });
});
apiRouter.get("/api/tunnels/:id", async (req, res) => {
  const tunnel = await tunnelStore.get(req.params.id);
  if (!tunnel) {
    res.status(404).json({ error: "Tunnel not found" });
    return;
  }
  res.json({ tunnel });
});
apiRouter.delete("/api/tunnels/:id", requireCsrf, async (req, res) => {
  const success = await tunnelManager.stopTunnel(req.params.id, "manual");
  if (!success) {
    res.status(404).json({ error: "Tunnel not found or already stopped" });
    return;
  }
  res.json({ success: true, message: "Tunnel stopped successfully" });
});
apiRouter.post("/api/tunnels/:id/stop", requireCsrf, async (req, res) => {
  const success = await tunnelManager.stopTunnel(req.params.id, "manual");
  if (!success) {
    res.status(404).json({ error: "Tunnel not found or already stopped" });
    return;
  }
  res.json({ success: true, message: "Tunnel stopped" });
});
apiRouter.post("/api/tunnels/:id/extend", requireCsrf, async (req, res) => {
  const { seconds } = req.body || {};
  const addSeconds = parseInt(seconds, 10);
  if (isNaN(addSeconds) || addSeconds <= 0) {
    res.status(400).json({ error: "Invalid extension duration" });
    return;
  }
  const result = await tunnelManager.extendTunnel(req.params.id, addSeconds);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true, tunnel: result.tunnel });
});
apiRouter.get("/api/stats", async (req, res) => {
  const stats = await tunnelManager.getSystemStats();
  res.json(stats);
});
apiRouter.get("/api/activity", async (req, res) => {
  const limit = parseInt(req.query.limit || "50", 10);
  const activity = await tunnelStore.getActivity(Math.min(limit, 200));
  res.json({ activity });
});
apiRouter.post("/api/tokens/generate", requireCsrf, async (req, res) => {
  const { durationSeconds = 86400, label } = req.body || {};
  const token = authService.createEphemeralClientToken(durationSeconds, label);
  res.json({ token, expiresAt: Date.now() + durationSeconds * 1e3 });
});

// server/src/websocket/client.ws.ts
import { WebSocket as WebSocket3 } from "ws";
function handleClientWebSocketConnection(ws, req) {
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  let isAuthenticated = false;
  let boundTunnelId = null;
  let isAlive = true;
  logger.info("Client WebSocket connected", { clientIp });
  const pingInterval = setInterval(() => {
    if (!isAlive) {
      logger.warn("Client heartbeat failed, terminating socket", { tunnelId: boundTunnelId });
      clearInterval(pingInterval);
      return ws.terminate();
    }
    isAlive = false;
    if (ws.readyState === WebSocket3.OPEN) {
      ws.ping();
    }
  }, 2e4);
  ws.on("pong", () => {
    isAlive = true;
  });
  ws.on("message", async (data) => {
    const msg = parseMessage(data);
    if (!msg) {
      logger.warn("Received unparseable message from client", { clientIp });
      return;
    }
    try {
      switch (msg.type) {
        case "ping": {
          ws.send(serializeMessage(createMessage("pong", {}, boundTunnelId || void 0, msg.requestId)));
          break;
        }
        case "pong": {
          isAlive = true;
          break;
        }
        case "client_hello": {
          const payload = msg.payload;
          if (!payload || !authService.verifyClientToken(payload.token)) {
            logger.warn("Client authentication failed", { clientIp });
            ws.send(
              serializeMessage(
                createMessage("error", {
                  code: "UNAUTHORIZED",
                  message: "Authentication failed. Invalid tunnel token."
                })
              )
            );
            ws.close(4001, "Unauthorized");
            return;
          }
          isAuthenticated = true;
          logger.info("Client authenticated successfully", { clientIp, version: payload.clientVersion });
          const serverHello = {
            serverVersion: "1.0.0",
            authenticated: true,
            maxBodySize: config.maxBodySize,
            allowedDurations: [1800, 3600, 7200, 10800],
            // 30m, 1h, 2h, 3h
            message: "Connected to R-Tunnel server"
          };
          ws.send(serializeMessage(createMessage("server_hello", serverHello, void 0, msg.requestId)));
          break;
        }
        case "create_tunnel": {
          if (!isAuthenticated) {
            ws.send(
              serializeMessage(
                createMessage("error", {
                  code: "UNAUTHORIZED",
                  message: "Handshake incomplete: Client must send client_hello first."
                }, void 0, msg.requestId)
              )
            );
            return;
          }
          const payload = msg.payload;
          if (!payload || !payload.port) {
            ws.send(
              serializeMessage(
                createMessage("error", {
                  code: "BAD_REQUEST",
                  message: "Local port is required to create a tunnel."
                }, void 0, msg.requestId)
              )
            );
            return;
          }
          if (payload.customTunnelId) {
            const existing = await tunnelStore.get(payload.customTunnelId);
            if (existing && existing.status !== "expired" && existing.expiresAt > Date.now()) {
              boundTunnelId = existing.id;
              await tunnelManager.bindClientConnection(existing.id, ws, clientIp);
              const createdPayload2 = {
                tunnelId: existing.id,
                publicUrl: existing.publicUrl,
                localPort: existing.localPort,
                createdAt: existing.createdAt,
                expiresAt: existing.expiresAt,
                durationSeconds: existing.durationSeconds,
                maxBodySize: config.maxBodySize
              };
              ws.send(serializeMessage(createMessage("tunnel_created", createdPayload2, existing.id, msg.requestId)));
              return;
            }
          }
          const { tunnel, error } = await tunnelManager.createTunnel({
            port: payload.port,
            durationSeconds: payload.durationSeconds,
            label: payload.label,
            customTunnelId: payload.customTunnelId,
            clientIp
          });
          if (error || !tunnel) {
            ws.send(
              serializeMessage(
                createMessage("error", {
                  code: "CREATION_FAILED",
                  message: error || "Failed to create tunnel."
                }, void 0, msg.requestId)
              )
            );
            return;
          }
          boundTunnelId = tunnel.id;
          await tunnelManager.bindClientConnection(tunnel.id, ws, clientIp);
          const createdPayload = {
            tunnelId: tunnel.id,
            publicUrl: tunnel.publicUrl,
            localPort: tunnel.localPort,
            createdAt: tunnel.createdAt,
            expiresAt: tunnel.expiresAt,
            durationSeconds: tunnel.durationSeconds,
            maxBodySize: config.maxBodySize
          };
          ws.send(serializeMessage(createMessage("tunnel_created", createdPayload, tunnel.id, msg.requestId)));
          break;
        }
        case "http_response": {
          const payload = msg.payload;
          if (payload && payload.requestId) {
            await tunnelManager.handleHttpResponse(payload, boundTunnelId || void 0);
          }
          break;
        }
        case "disconnect": {
          logger.info("Client sent graceful disconnect message", { tunnelId: boundTunnelId });
          if (boundTunnelId) {
            await tunnelManager.stopTunnel(boundTunnelId, "manual");
          }
          ws.close();
          break;
        }
        default:
          logger.debug("Unhandled message type", { type: msg.type });
      }
    } catch (err) {
      logger.error("Error handling WebSocket message", { error: err.message, stack: err.stack });
    }
  });
  ws.on("close", async () => {
    clearInterval(pingInterval);
    if (boundTunnelId) {
      await tunnelManager.handleClientDisconnect(boundTunnelId, ws);
    }
    logger.info("Client WebSocket closed", { clientIp, tunnelId: boundTunnelId });
  });
  ws.on("error", (err) => {
    logger.error("Client WebSocket error", { error: err.message, tunnelId: boundTunnelId });
  });
}

// server/src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function resolveWebDir() {
  const candidates = [
    path.resolve(process.cwd(), "web"),
    path.resolve(__dirname, "../../web"),
    path.resolve(__dirname, "../web"),
    path.resolve(__dirname, "web"),
    "/app/applet/web"
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), "web");
}
var webDir = resolveWebDir();
var app = express();
var server = http.createServer(app);
app.set("trust proxy", true);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (config.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(proxyMiddleware);
app.use(express.json({ limit: `${Math.round(config.maxBodySize / (1024 * 1024))}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${Math.round(config.maxBodySize / (1024 * 1024))}mb` }));
app.use(cookieParser());
app.use(apiRouter);
app.use(express.static(webDir, { index: false }));
app.get("/", (req, res) => {
  res.sendFile(path.join(webDir, "index.html"));
});
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(webDir, "dashboard.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(webDir, "login.html"));
});
app.get("/docs", (req, res) => {
  res.sendFile(path.join(webDir, "docs.html"));
});
app.use((req, res) => {
  if (req.accepts("html")) {
    res.status(404).sendFile(path.join(webDir, "error.html"));
  } else {
    res.status(404).json({ error: "Not Found", path: req.path });
  }
});
app.use((err, req, res, next) => {
  logger.error("Unhandled server error", { error: err.message, stack: err.stack });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal Server Error", message: config.isProduction ? void 0 : err.message });
});
var clientWss = new WebSocketServer2({ noServer: true, maxPayload: config.maxWsMessageSize });
var dashboardWss = new WebSocketServer2({ noServer: true, maxPayload: 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  if (pathname === "/ws/client") {
    clientWss.handleUpgrade(req, socket, head, (ws) => {
      handleClientWebSocketConnection(ws, req);
    });
  } else if (pathname === "/ws/dashboard") {
    dashboardWss.handleUpgrade(req, socket, head, (ws) => {
      dashboardWsManager.handleConnection(ws, req);
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});
server.listen(config.port, config.host, () => {
  logger.info(`R-Tunnel server started on http://${config.host}:${config.port}`, {
    env: config.env,
    publicBaseUrl: config.publicBaseUrl || `http://localhost:${config.port}`,
    publicBaseDomain: config.publicBaseDomain || "(path-based fallback)",
    maxActiveTunnels: config.maxActiveTunnels
  });
});
var shutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP & WebSocket servers closed.");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forceful shutdown timeout.");
    process.exit(1);
  }, 1e4).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
export {
  app,
  server
};
