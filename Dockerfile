# --- build stage ---
FROM node:20-slim AS build
# native build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# repo pins packageManager pnpm@9.0.0, whose `pnpm deploy` hits an EEXIST
# symlink bug under node-linker=hoisted; bump to a later 9.x for this build
# stage only. COREPACK_ENABLE_PROJECT_SPEC=0 stops corepack from re-pinning
# back to 9.0.0 via the repo's packageManager field.
RUN corepack prepare pnpm@9.15.9 --activate
ENV COREPACK_ENABLE_PROJECT_SPEC=0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# pruned, self-contained production api (prod deps only, native addons compiled for this image)
RUN pnpm --filter @tasknote/api deploy --prod /out/api

# --- runtime stage ---
FROM node:20-slim
WORKDIR /app
COPY --from=build /out/api /app
COPY --from=build /repo/apps/web/dist /app/web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    TASKNOTE_STATIC_DIR=/app/web \
    TASKNOTE_DB_PATH=/data/tasknote.sqlite
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
