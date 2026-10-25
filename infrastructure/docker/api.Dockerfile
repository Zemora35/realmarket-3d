# RealMarket API (Fastify + Drizzle) — üretim imajı.
# Derleme: docker build -f infrastructure/docker/api.Dockerfile -t realmarket-api .
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
# Bağımlılık katmanı: yalnızca manifestler değişince yeniden kurulur
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN find packages -type f ! -name package.json -delete \
 && pnpm install --frozen-lockfile --filter "@realmarket/api..." --config.confirmModulesPurge=false

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    STORAGE_DIR=/data/storage \
    MODELS_DIR=/data/models
WORKDIR /app
RUN corepack enable && mkdir -p /data/storage /data/models && chown -R node:node /data
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@realmarket/api", "start"]
