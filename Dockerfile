# Multi-stage production Dockerfile optimized for Render
# Base Node 20 LTS Alpine image
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy application sources
COPY . .

# Compile client SPA and server bundles
RUN npm run build

# Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy compiled bundles and web static assets from builder
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web ./web

# Create non-root user for security
USER node

# Render automatically maps the port defined in PORT (default 10000)
EXPOSE 10000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:10000/health || exit 1

# Start R-Tunnel server
CMD ["node", "server.js"]
