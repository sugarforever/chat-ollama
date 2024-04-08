FROM 0001coder/chatollama:latest

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

COPY . .

RUN pnpm run prisma-generate
RUN pnpm run build

EXPOSE 3000

# CMD ["node", ".output/server/index.mjs"]
CMD [ "tail", "-f", "/dev/null"]
