# Chat Ollama

This is a Nuxt 3 + Ollama web application. It's an example of Ollama Javascript library.

Feature list:
- Models management (list, download, delete)
- Chat with models

## Developers Guide

As ChatOllama is still under active development, features, interfaces and database schema may be changed. Please follow the instructions below in your every `git pull` to make sure your dependencies and database schema are always in sync.

1. Install the latest dependencies
    - `npm install` OR
    - `pnpm install`
2. Prisma migrate
    - `pnpm run prisma-migrate` OR
    - `npm run prisma-migrate`

## Change logs:

Here we summarize what's done and released in our day-to-day development.

### 03/10/2024

1. Instructions data will be stored in SQLite database.
2. `vueuse` is introduced for storage management.

## Users Guide

As a user of `ChatOllama`, please walk through the document below, to make sure you get all the components up and running before starting using `ChatOllama`.

### Ollama Server

You will need an Ollama server running. You can run it in local environment following the installation guide of [Ollama](https://github.com/ollama/ollama).

By default, Ollama server is running on http://localhost:11434.

### Install ChromaDB and startup

```bash
#https://hub.docker.com/r/chromadb/chroma/tags

docker pull chromadb/chroma
docker run -d -p 8000:8000 chromadb/chroma
```
Now, ChromaDB is running on http://localhost:8000

### Setup

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

### Development Server

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
