# syntax=docker/dockerfile:1

# ---- deps: production dependencies only -------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile; --omit=dev keeps jest/supertest out
# of the runtime image, which keeps the Snyk container scan focused on code
# that actually ships.
RUN npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime

# Passed by the workflow as --build-arg GIT_COMMIT=${{ github.sha }} and
# surfaced by GET /version, so you can confirm which build is serving traffic.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Run unprivileged. The node images ship a `node` user; use it rather than root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form (no shell) so PID 1 is node and it receives SIGTERM directly -
# the shell form would swallow the signal and break graceful shutdown.
CMD ["node", "src/server.js"]
