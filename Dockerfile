# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: install every dependency and compile client + server.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 is a native module and compiles during install, so the build
# stage needs a toolchain and Python. The runtime stage does not.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# npm 12 gates install scripts; these packages need theirs to run.
COPY .npmrc package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# PUPPETEER_SKIP_DOWNLOAD keeps the build image small: the runtime stage uses
# the distro Chromium instead of Puppeteer's bundled copy.
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN npm ci

COPY . .

RUN npm run build --workspace @marriage-invitations/client \
 && npm run build --workspace @marriage-invitations/server

# ---------------------------------------------------------------------------
# Runtime stage: Node plus a real Chromium and real fonts.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/history.sqlite \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

# Chromium renders the PDF. The font packages are not optional: without them,
# Cyrillic (Russian) guest names render as empty boxes in the output PDF.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-noto-core \
      fonts-noto-extra \
      fonts-dejavu-core \
      fonts-liberation \
      ca-certificates \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies are copied from the build stage rather than reinstalled here.
# better-sqlite3 is a native module, so a fresh `npm ci` would need a compiler
# in the runtime image; the build stage has already produced the binary.
COPY --from=build /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Compiled server, its stylesheet, and the built SPA.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# History lives on a volume so it survives redeploys.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/countries').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
