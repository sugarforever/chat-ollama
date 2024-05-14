#!/bin/sh

# Guarantee that the database schema is up-to-date with Prisma schema
pnpm run prisma-deploy

if [ -f /app/.env ]; then
  node --env-file=/app/.env .output/server/index.mjs
else
  node .output/server/index.mjs
fi
