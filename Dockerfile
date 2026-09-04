# ── Stage 1: build the React frontend ─────────────────────────────────────────
FROM node:20-bookworm-slim AS web

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build


# ── Stage 2: the runtime image (Express API + the built frontend) ─────────────
FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY backend/ ./
COPY --from=web /build/dist ./public

# Reference-image uploads are bind-mounted here by docker-compose.
RUN mkdir -p /data/uploads && chown -R node:node /data

ENV NODE_ENV=production PORT=5000
EXPOSE 5000
USER node

CMD ["node", "src/index.js"]
