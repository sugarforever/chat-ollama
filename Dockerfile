#ARG NODE_VERSION=20.5.1
ARG NODE_VERSION=18.18.0

FROM node:${NODE_VERSION}-slim as builder

WORKDIR /app

COPY . .

RUN npm config set registry http://mirrors.cloud.tencent.com/npm/
RUN rm pnpm-lock.yaml
RUN rm -rf node_modules
RUN npm install -g pnpm
RUN pnpm i
RUN pnpm run build


FROM node:${NODE_VERSION}-slim

WORKDIR /app
COPY --from=builder /app/.output /app/.output
COPY ./prisma/sqlite_data/chatollama.sqlite /sqlite_data/chatollama.sqlite
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
