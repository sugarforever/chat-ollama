ARG NODE_VERSION=20.13.1

FROM node:${NODE_VERSION}-slim

RUN apt-get update && apt-get install -y openssl iputils-ping net-tools

WORKDIR /app

# DATABASE_URL environment variable takes precedence over .env file configuration
ENV DATABASE_URL=file:/app/sqlite/chatollama.sqlite

COPY pnpm-lock.yaml package.json ./
RUN npm install -g pnpm
RUN pnpm i

COPY . .

# Generate Prisma client before building the application
RUN pnpm run prisma-generate

# Build the application
RUN pnpm run build

# This is important: Copy the generated Prisma files to the output directory
RUN mkdir -p .output/server/node_modules/.prisma
RUN cp -R node_modules/.prisma/client .output/server/node_modules/.prisma/

EXPOSE 3000

CMD ["sh", "/app/scripts/startup.sh"]
