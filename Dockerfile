FROM node:24-slim AS web
WORKDIR /w
COPY web/package.json ./web/
RUN cd web && npm install
COPY web ./web
RUN mkdir server && cd web && npm run build

FROM node:24-slim
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/src ./src
COPY --from=web /w/server/public ./public
ENV DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "src/index.js"]
