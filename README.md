# ChatOllama

ChatOllama is a self-hosted AI chat application built with **SvelteKit,
TypeScript, and Pi Durable**. It combines persistent conversations, document
knowledge bases, and Model Context Protocol (MCP) tools in one Node.js service.
SQLite and local files provide storage; no separate database or vector service
is required.

## Install with Docker Compose

Install Git and Docker with Docker Compose, then clone the repository:

```sh
git clone https://github.com/sugarforever/chat-ollama.git
cd chat-ollama/rewrite
cp .env.example .env
```

Edit `.env` before starting:

| Variable | What to set |
| --- | --- |
| `ORIGIN` | The exact URL you will open, such as `http://localhost:3000` |
| `CHAT_BASE_URL` | Your OpenAI-compatible chat endpoint, including `/v1` where required |
| `CHAT_MODEL_ID` | A model ID available at that endpoint |
| `CHAT_API_KEY` | Your provider's API key, if required |
| `EMBEDDING_BASE_URL` | Your OpenAI-compatible embedding endpoint |
| `EMBEDDING_MODEL_ID` | An embedding model available at that endpoint |
| `EMBEDDING_API_KEY` | Its API key, if required |

Chat and embedding models are configured independently. Embedding configuration
is needed for knowledge bases; ordinary chat only needs a chat model.
Ollama works through its OpenAI-compatible endpoint.

Inside Docker, `localhost` refers to the app container. To reach a model server
on your computer, use a reachable address such as
`http://host.docker.internal:11434/v1`. The model server must accept connections
from Docker.

Start the application:

```sh
docker compose up --build -d
docker compose logs -f app
```

Open `http://localhost:3000` (or your configured `ORIGIN`) to use the workspace
directly. There is no application login. Anyone with network access can use the
app and its tools; the default port binding is local-only. To use another local
port, set both `PORT=3001` and `ORIGIN=http://localhost:3001`.

All application commands in this guide run from **`rewrite/`**, which has its
own package manifest and lockfile.

## Install with Node.js

Use Node.js **24.22.2** and pnpm **10.8.1**. From the repository root:

```sh
cd rewrite
pnpm install
pnpm build

export ORIGIN='http://localhost:3000'
export CHAT_BASE_URL='http://127.0.0.1:11434/v1'
export CHAT_MODEL_ID='your-chat-model'
# Export CHAT_API_KEY if your provider requires it.

pnpm start
```

`pnpm start` does not automatically load `.env`; export environment variables
before starting. For a local model server, use its host-reachable address,
not the Docker-specific example address. Configure embeddings in Settings
before uploading knowledge documents.

## Use ChatOllama

### Configure models

Open **Settings → Providers → Add provider** and choose an API provider or a
ChatGPT/Claude subscription. The catalog choice fixes the service. For API
providers, enter your API key; the app automatically checks the connection and
loads models from the provider's models endpoint. The newest model by release
timestamp is selected initially; choose another if desired, then **Save provider**.
Providers without timestamps keep their returned order. For subscriptions, click
**Connect account** and complete official sign-in/authorization in the popup.
Custom OpenAI-compatible endpoints can be configured separately. Secrets stay
on the server.

Choose the default provider on **Settings → Chat defaults**, or switch provider/model inside
an existing conversation with **Apply to next message**. Active runs retain their
captured configuration across restarts. Embeddings use a separate endpoint/key;
chat subscription credentials do not apply. See the [provider and authentication
guide](rewrite/docs/provider-auth.md) for cloud setup, persistence and disconnect behavior.

On upgrade, the previous chat settings (or `CHAT_*` environment defaults) are
saved once as **Legacy chat**. Existing rewrite conversations are pinned to that
provider and keep their model IDs. Back up the data directory before upgrading;
this upgrade does not import data from the older Nuxt application.

### Chat

Create a conversation, choose its provider/model pair and any knowledge bases
or MCP servers, then send a message. Use **Conversation provider**, **Conversation
model ID**, and **Apply to next message** to switch in the same conversation.
History stays intact. The saved pair persists across reloads and restarts.
Changing defaults affects new conversations only. Editing a provider's URL/key
applies to subsequent input in conversations using that provider. Removing it
requires those conversations to choose another provider before sending again.

An active run continues with its captured provider, model and key, including
after an application-process restart on an intact data volume. Switching the
selection does not stop it. Responses render as streaming Markdown. Expand tool
activity to inspect execution, and open source citations to view excerpts.
Closing the browser does not stop a task; use **Stop** to cancel explicitly.

### Add a knowledge base

1. Configure an embedding endpoint and model in Settings.
2. Create a named knowledge collection and upload text-based PDF, Markdown,
   or plain-text documents, up to 10 MiB per file.
3. Wait for indexing to finish; retry failed documents when needed.
4. Select the collection when creating a conversation and ask about its content.
   The agent can search the selected collections and cite source passages.

Scanned PDFs need text extraction outside the app; OCR is not included.
After changing embedding settings, explicitly use **Reindex collection** for
existing collections.

### Connect MCP tools

In Settings, configure local **stdio** or remote **Streamable HTTP** MCP
servers, then select the servers when creating a conversation. The MCP editor
replaces the complete server list: include every intended server and its full
credentials. Saved secrets are not filled into the editor.

Selected tools run without per-call approval. If an external action is
interrupted and its outcome is uncertain, check the external system and
acknowledge the outcome in the conversation before continuing. Acknowledgment
does not retry the action; Stop cannot undo an external change.

For stdio servers, commands execute on the application server. With Docker,
install the required MCP executables and runtimes in the container image.
See the [MCP configuration details](./rewrite/README.md#local-nodejs-setup).

## Data and deployment

Docker Compose stores data in its `rewrite-data` volume. Direct Node.js
execution uses `rewrite/data` by default, configurable through `DATA_DIR`.
Keep the whole data directory: it contains settings, uploaded documents,
knowledge indexes, conversation databases, and credential-bearing sidecars.
Stop the application before backing it up.

Run one application process per data directory. For public deployment, use
HTTPS, set the exact public `ORIGIN`, and configure the reverse proxy to allow
unbuffered SSE connections.

Existing ChatOllama databases and vector indexes cannot be opened directly by
this system. Automatic migration and export/import are not included.

See [deployment, backup, and restore instructions](./rewrite/README.md#docker-deployment-and-operations)
for operational details. See [build and validation evidence](./rewrite/docs/build-evidence.md)
for the tested behavior and recovery limits.

[MIT License](./LICENSE)
