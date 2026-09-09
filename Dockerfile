ARG NODE_VERSION=24.20.0

FROM node:${NODE_VERSION}-slim

RUN apt-get update && apt-get install -y openssl iputils-ping net-tools python3 make g++ sqlite3 postgresql-client

WORKDIR /app

# DATABASE_URL environment variable takes precedence over .env file configuration
ENV DATABASE_URL=file:/app/sqlite/chatollama.sqlite

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/agent-cli/package.json ./packages/agent-cli/package.json
COPY packages/agent-runtime/package.json ./packages/agent-runtime/package.json
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

RUN pnpm run prisma-generate

RUN pnpm run build

EXPOSE 3000

CMD ["sh", "/app/scripts/startup.sh"]
