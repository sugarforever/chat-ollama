ARG NODE_VERSION=20.5.1

FROM node:${NODE_VERSION}-slim

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

# DATABASE_URL environment variable takes precedence over .env file configuration
ENV DATABASE_URL=file:/app/sqlite/chatollama.sqlite

COPY . .
COPY .env.example .env

RUN npm install -g pnpm

RUN pnpm i
RUN pnpm run prisma-generate
RUN pnpm run prisma-migrate
RUN pnpm run build

EXPOSE 3000

# Nodejs 20+ supports env-file
CMD ["node", "--env-file=.env", ".output/server/index.mjs"]
