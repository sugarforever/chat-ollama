FROM node:24.22.2-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.8.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24.22.2-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/server.mjs ./
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/desktop/backend-owner.mjs ./desktop/backend-owner.mjs
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME /data
CMD ["node", "server.mjs"]
