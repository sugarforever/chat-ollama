ARG NODE_VERSION=20.12.2

FROM node:${NODE_VERSION}-slim

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

# DATABASE_URL environment variable takes precedence over .env file configuration
ENV DATABASE_URL=file:/app/sqlite/chatollama.sqlite

COPY pnpm-lock.yaml package.json ./
RUN npm install -g pnpm
RUN pnpm i

COPY . .

RUN pnpm run prisma-generate
RUN pnpm run build

EXPOSE 3000

CMD ["sh", "/app/scripts/startup.sh"]
