# Company Car Sharing – Next.js app (Node 22 aligns with current Next.js / CI)
FROM node:22-alpine AS base

# Install dependencies and build
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Baked into the client bundle; override at build time: docker compose build --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com
ARG NEXT_PUBLIC_APP_URL=http://localhost:3100
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/proxy-3001.js ./proxy-3001.js
EXPOSE 3000
# Cloud hosts (Render, Fly, etc.) set PORT; next start reads PORT when -p is omitted (see package.json start:docker).
# docker-compose overrides CMD to `npm run start` (Next :3100 + proxy :3101 inside the container).
ENV HOSTNAME="0.0.0.0"
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:docker"]
