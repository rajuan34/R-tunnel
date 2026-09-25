# R-Tunnel Security Documentation

R-Tunnel is treated as a security-critical networking application. The following security controls and threat mitigations are implemented throughout the architecture.

---

## 1. Anti-SSRF (Server-Side Request Forgery) Protection

### Threat:
Public users or rogue clients attempting to force the Render server to make arbitrary outbound TCP connections to internal clouds, metadata endpoints (`169.254.169.254`), or private internal subnets.

### Mitigations:
1. **Server Never Directly Proxies Outbound IPs:**
   The Render server NEVER accepts a `targetUrl` parameter from callers. Inbound requests are exclusively routed through established, authenticated client WebSocket connections.
2. **Client Localhost Restriction:**
   The Termux client explicitly validates the destination address:
   ```typescript
   export function isValidLocalhost(host: string): boolean {
     const h = host.trim().toLowerCase();
     return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
   }
   ```
   Attempts to configure or forward to external IPs or LAN addresses (e.g. `192.168.1.1`) are immediately rejected with an HTTP 403 Forbidden.

---

## 2. No Open Proxy / Unauthorized Use

- **Token Authentication:** Anonymous tunnel creation is strictly prevented. Clients must provide either:
  - `TUNNEL_MASTER_TOKEN` configured in Render environment variables.
  - An ephemeral, scoped client token generated through the authenticated admin dashboard.
- **Strict ID Matching:** Unknown tunnel IDs return 404 Not Found. Expired tunnel IDs return 410 Gone. The server will never attempt to route requests for inactive or unmapped IDs.

---

## 3. Cryptographically Secure Identifiers

- **Tunnel IDs:** Generated using Node.js `crypto.randomBytes()`. IDs are minimum 8 characters long, using safe lowercase alphanumeric characters (`23456789abcdefghjkmnpqrstuvwxyz`).
- Predictable sequential IDs and arbitrary user-supplied subdomain injection are prohibited.
- `Math.random()` is strictly never used for identifiers or tokens.

---

## 4. Admin Dashboard Security

- **Password Hashing:** Passwords are verified against bcrypt hashes stored in `ADMIN_PASSWORD_HASH`. Plaintext passwords are never stored in source code.
- **Session Tokens:** Cryptographically secure 256-bit random tokens stored in `HttpOnly`, `SameSite=Lax` cookies (and marked `Secure` in production).
- **CSRF Protection:** State-changing requests (`POST`, `PUT`, `DELETE`) require an active session matching CSRF token transmitted via the `X-CSRF-Token` header.
- **Brute Force Protection:** Login attempts are rate-limited to 10 requests per minute per IP.

---

## 5. Safe Logging & Data Redaction

The structured logger and activity logger automatically sanitize metadata and headers. The following sensitive keys are redacted with `[REDACTED]`:
- `authorization`
- `cookie` & `set-cookie`
- `token` & `masterToken`
- `password`
- `secret`
- `api-key`

---

## 6. Denial of Service & Abuse Mitigation

- **Request Body Limits:** `MAX_BODY_SIZE` (default 10MB) protects against memory exhaustion.
- **WebSocket Message Limits:** `MAX_WS_MESSAGE_SIZE` (default 12MB).
- **Rate Limiting:** `MAX_REQUESTS_PER_MINUTE` (default 120 requests/minute per client IP / tunnel).
- **Connection Quota:** `MAX_ACTIVE_TUNNELS` (default 5 concurrent active tunnels).
- **Server-Authoritative Expiration:** Client clocks are not trusted; expiration is strictly evaluated against server time.
