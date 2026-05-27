FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# SESSION_SECRET is validated at module init; provide a build-time placeholder
# (the real secret is injected at runtime via the container environment)
ENV SESSION_SECRET=build-time-placeholder-not-used-at-runtime-32chars
# NEXT_PUBLIC_* vars are inlined at build time by Next.js — must be set here,
# not only in docker-compose. The dashboard talks to the openbrain service via
# the internal docker network.
ENV NEXT_PUBLIC_API_URL=http://openbrain:3000/api
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
