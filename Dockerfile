ARG NODE_VERSION=20.5.1

FROM node:${NODE_VERSION}-slim

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

RUN npm install -g pnpm

RUN pnpm i

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
