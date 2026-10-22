# The UI build is the same on every platform: run it on the build machine, not under emulation, when building for arm64
FROM --platform=$BUILDPLATFORM node:24-slim AS web
WORKDIR /w
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
# the web bundles this one server module (the structural diff of History, shared with the server)
COPY server/src/schemaDiff.js ./server/src/schemaDiff.js
RUN cd web && npm run build

FROM node:24-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY LICENSE NOTICE ./
COPY --from=web /w/server/public ./public
# runs as the unprivileged `node` user of the base image; /data is created here so a new volume is owned by it
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/index.js"]
