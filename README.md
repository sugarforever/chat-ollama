# ChatOllama

This is a Nuxt 3 + Ollama web application. It's an example of Ollama Javascript library.

Feature list:
- Models management (list, download, delete)
- Chat with models

## Join Our Community

If you are a user, contributor, or even just new to `ChatOllama`, you are more than welcome to join our community on Discord by clicking the [invite link](https://discord.gg/CrvTBVrxXy).

If you are a contributor, the channel `technical-discussion` is for you, where we discuss technical stuff.

If you have any issue in `ChatOllama` usage, please report to channel `customer-support`. We will help you out as soon as we can.

## Users Guide

As a user of `ChatOllama`, please walk through the document below, to make sure you get all the components up and running before starting using `ChatOllama`.

### Use with Docker

This is the easist way to use `ChatOllama`.

The only thing you need is a copy of [docker-compose.yaml](./docker-compose.yaml). Please download a copy of `docker-compose.yaml` and execute the command below to launch `ChatOllama`.

```shell
$ docker compose up
```

As `ChatOllama` is running within a docker container, you should set Ollama server to `http://host.docker.internal:11434` in the Settings section, assuming your Ollama server is running locally with default port.

Make sure you initialize the SQLite database as below if you are launching the dockerized `ChatOllama` for the first time:

```shell
# In the folder of docker-compose.yaml

$ docker compose exec chatollama npx prisma migrate dev
```
#### Prerequisites for knowledge bases
When using KnowledgeBases, we need a valid embedding model in place. It can be one of the models downloaded by Ollama or from 3rd party service provider for example, OpenAI.

**Ollama Managed Embedding Model**

We recommand you download `nomic-embed-text` model for embedding purpose.

You can do so on Models page http://localhost:3000/models, or via CLI as below if you are using Docker.

```
# In the folder of docker-compose.yaml

docker compose exec ollama ollama pull nomic-embed-text:latest
```

**OpenAI Embedding Model**

If you prefer to use OpenAI, please make sure you set a valid OpenAI API Key in Settings, and fill with one of the OpenAI embedding models listed below:

- `text-embedding-3-large`
- `text-embedding-3-small`
- `text-embedding-ada-002`

#### Data Storage with Docker Containers

There are 2 types of data storage, vector data and relational data. See the summary below and for more details, please refer to [docker-compose.yaml](./docker-compose.yaml) for the settings.

##### Chromadb

With `docker-compose.yaml`, a dockerized Chroma database is run side by side with `ChatOllama`. The data is persisted in a docker volume.

##### SQLite

The SQLite database file is persisted and mounted from `~/.chatollama/chatollama.sqlite`.

### Use with Git Clone

If you'd like to run with the latest code base and apply changes as needed, you can clone this repository and follow the steps below.

#### Ollama Server

You will need an Ollama server running. You can run it in local environment following the installation guide of [Ollama](https://github.com/ollama/ollama).

By default, Ollama server is running on http://localhost:11434.

#### Install ChromaDB and startup

```bash
#https://hub.docker.com/r/chromadb/chroma/tags

docker pull chromadb/chroma
docker run -d -p 8000:8000 chromadb/chroma
```
Now, ChromaDB is running on http://localhost:8000

#### Setup

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

#### Development Server

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
