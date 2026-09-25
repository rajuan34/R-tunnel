# R-Tunnel REST API Specification

All administrative API endpoints require authentication via session cookie (`rt_session`) or Bearer token header (`Authorization: Bearer <session-token>`).

State-changing requests (`POST`, `PUT`, `DELETE`) require a valid `X-CSRF-Token` header matching the current session.

---

## Public Endpoints

### 1. Health Check
```http
GET /health
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "uptime": 1245.2
}
```

---

## Authentication Endpoints

### 2. Admin Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "mySecurePassword"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "user": { "username": "admin" },
  "csrfToken": "a8f3b...",
  "expiresAt": 1727306400000
}
```
Sets `Set-Cookie: rt_session=<token>; HttpOnly; SameSite=Lax`.

### 3. Admin Logout
```http
POST /api/auth/logout
```
**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 4. Current Session Info
```http
GET /api/auth/me
```
**Response (200 OK):**
```json
{
  "authenticated": true,
  "user": { "username": "admin" },
  "csrfToken": "a8f3b...",
  "expiresAt": 1727306400000
}
```

---

## Tunnel Management Endpoints

### 5. List Tunnels
```http
GET /api/tunnels
```
**Response (200 OK):**
```json
{
  "tunnels": [
    {
      "id": "x7k29m4p",
      "localPort": 8080,
      "label": "Test Server",
      "createdAt": 1727220000000,
      "expiresAt": 1727223600000,
      "durationSeconds": 3600,
      "lastActivity": 1727220120000,
      "status": "connected",
      "publicUrl": "https://r-tunnel.onrender.com/t/x7k29m4p",
      "requestCount": 42,
      "bytesIn": 14200,
      "bytesOut": 84500
    }
  ]
}
```

### 6. Create Tunnel
```http
POST /api/tunnels
Content-Type: application/json
X-CSRF-Token: <token>

{
  "port": 8080,
  "duration": 3600,
  "label": "Node API"
}
```
**Response (201 Created):**
```json
{
  "tunnel": { ... },
  "clientToken": "rt_98ab7c...",
  "cliCommand": "rtunnel create --server \"https://...\" --token \"rt_98ab7c...\" --port 8080 --id x7k29m4p"
}
```

### 7. Stop / Terminate Tunnel
```http
POST /api/tunnels/:id/stop
X-CSRF-Token: <token>
```
**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tunnel stopped"
}
```

### 8. Extend Tunnel Duration
```http
POST /api/tunnels/:id/extend
Content-Type: application/json
X-CSRF-Token: <token>

{
  "seconds": 3600
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "tunnel": { ... }
}
```

---

## Analytics Endpoints

### 9. System Statistics
```http
GET /api/stats
```
**Response (200 OK):**
```json
{
  "activeTunnels": 2,
  "totalRequests": 184,
  "totalBytesIn": 45000,
  "totalBytesOut": 320000,
  "connectedClients": 2,
  "uptimeSeconds": 3600,
  "serverTime": 1727223600000
}
```

### 10. Request Activity Stream
```http
GET /api/activity?limit=50
```
**Response (200 OK):**
```json
{
  "activity": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": 1727220120000,
      "tunnelId": "x7k29m4p",
      "method": "GET",
      "path": "/api/users",
      "statusCode": 200,
      "latencyMs": 34,
      "requestSizeBytes": 0,
      "responseSizeBytes": 1420
    }
  ]
}
```
