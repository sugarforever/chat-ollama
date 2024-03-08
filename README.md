# Chat Ollama

This is a Nuxt 3 + Ollama web application. It's an example of Ollama Javascript library.

Feature list:
- Models management (list, download, delete)
- Chat with models

## Ollama Server

You will need an Ollama server running. You can run it in local environment following the installation guide of [Ollama](https://github.com/ollama/ollama).

By default, Ollama server is running on http://localhost:11434.

## Install ChromaDB and startup

```bash
#https://hub.docker.com/r/chromadb/chroma/tags

docker pull chromadb/chroma
docker run -d -p 8000:8000 chromadb/chroma
```
Now, ChromaDB is running on http://localhost:8000

## Setup

1. Copy the `.env.example` file to `.env` file:

```bash
cp .env.example .env
```

2. Make sure to install the dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

3. Run a migration to create your database tables with Prisma Migrate
```bash
# npm
npm run prisma-migrate

# pnpm
pnpm prisma-migrate

# yarn
yarn prisma-migrate

# bun
bun run prisma-migrate
```

## Development Server

> Make sure both __[Ollama Server](#ollama-server)__ and __[ChromaDB](#install-chromadb-and-startup)__ are running.

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```
