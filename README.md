English | [简体中文](README.zh-Hans.md)

# ChatOllama

`ChatOllama` is an open source chatbot platform built with Nuxt 3, supporting a wide range of language models and advanced features including knowledge bases, realtime voice chat, and Model Context Protocol (MCP) integration.

## Supported Language Models

- **OpenAI** / **Azure OpenAI**
- **Anthropic**
- **Google Gemini**
- **Groq**
- **Moonshot**
- **Ollama**
- **OpenAI API compatible service providers**

## Key Features

- **Multi-modal Chat** - Text and image input support
- **Knowledge Bases** - RAG (Retrieval Augmented Generation) with document upload
- **Realtime Voice Chat** - Voice conversations with Gemini 2.0 Flash
- **Model Context Protocol (MCP)** - Extensible tool integration
- **Vector Databases** - Chroma and Milvus support
- **Docker Support** - Easy deployment with Docker Compose
- **Internationalization** - Multi-language support

## Quick Start

Choose your preferred deployment method:

### Option 1: Docker (Recommended)

The easiest way to get started. Download [docker-compose.yaml](./docker-compose.yaml) and run:

```bash
docker compose up
```

Initialize the database on first run:
```bash
docker compose exec chatollama npx prisma migrate dev
```

Access ChatOllama at http://localhost:3000

### Option 2: Development Setup

For development or customization:

1. **Prerequisites**
   - Node.js 18+ and pnpm
   - Ollama server running on http://localhost:11434
   - ChromaDB or Milvus vector database

2. **Installation**
   ```bash
   git clone git@github.com:sugarforever/chat-ollama.git
   cd chat-ollama
   cp .env.example .env
   pnpm install
   pnpm prisma-migrate
   pnpm dev
   ```

### Vector Database Configuration

ChatOllama supports two vector databases. Configure in your `.env` file:

```bash
# Choose: chroma or milvus
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000
MILVUS_URL=http://localhost:19530
```

**ChromaDB Setup (Default)**
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

## Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Database
DATABASE_URL=file:../../chatollama.sqlite

# Server
PORT=3000
HOST=

# Vector Database
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000

# Optional: API Keys for commercial models
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
MOONSHOT_API_KEY=your_moonshot_key

# Optional: Proxy settings
NUXT_PUBLIC_MODEL_PROXY_ENABLED=false
NUXT_MODEL_PROXY_URL=http://127.0.0.1:1080

# Optional: Cohere for reranking
COHERE_API_KEY=your_cohere_key
```

## Advanced Features

### Model Context Protocol (MCP)

ChatOllama integrates with MCP to extend AI capabilities through external tools and data sources. MCP servers are managed through a user-friendly interface in Settings.

**Supported Transport Types:**
- **STDIO** - Command-line tools (most common)
- **Server-Sent Events (SSE)** - HTTP-based streaming
- **Streamable HTTP** - HTTP-based communication

**Configuration via Settings UI:**
1. Navigate to **Settings → MCP** 
2. Click **"Add Server"** to create a new MCP server
3. Configure server details:
   - **Name**: Descriptive server name
   - **Transport**: Choose STDIO, SSE, or Streamable HTTP
   - **Command/Args** (STDIO): Executable path and arguments
   - **URL** (SSE/HTTP): Server endpoint URL
   - **Environment Variables**: API keys and configuration
   - **Enable/Disable**: Toggle server status

**STDIO Server Example:**
```
Name: Filesystem Tools
Transport: stdio
Command: uvx
Args: mcp-server-filesystem
Environment Variables:
  PATH: ${PATH}
```

**Migration from Legacy Config:**
If you have an existing `.mcp-servers.json` file:
```bash
pnpm exec ts-node scripts/migrate-mcp-servers.ts
```

**Popular MCP Servers:**
- `mcp-server-filesystem` - File system operations
- `mcp-server-git` - Git repository management  
- `mcp-server-sqlite` - SQLite database queries
- `mcp-server-brave-search` - Web search capabilities

**How MCP Works in Chat:**
When MCP servers are enabled, their tools become available to AI models during conversations. The AI can automatically call these tools to:
- Read/write files when discussing code
- Search the web for current information
- Query databases for specific data
- Perform system operations as needed

Tools are loaded dynamically and integrated seamlessly into the chat experience.

### Realtime Voice Chat

Enable voice conversations with Gemini 2.0 Flash:

1. Set your Google API key in Settings
2. Enable "Realtime Chat" in Settings  
3. Click the microphone icon to start voice conversations
4. Access via `/realtime` page

### Knowledge Bases

Create knowledge bases for RAG conversations:

1. **Create Knowledge Base** - Name and configure chunking parameters
2. **Upload Documents** - PDF, DOCX, TXT files supported
3. **Chat with Knowledge** - Reference your documents in conversations

**Supported Vector Databases:**
- **ChromaDB** (default) - Lightweight, easy setup
- **Milvus** - Production-scale vector database

### Data Storage

**Docker Deployment:**
- **Vector Data** - Stored in Docker volumes (chromadb_volume)
- **Relational Data** - SQLite database at `~/.chatollama/chatollama.sqlite`
- **Redis** - Session and caching data

**Development:**
- **Database** - Local SQLite file
- **Vector Store** - External ChromaDB/Milvus instance

## Development

### Project Structure

```
chatollama/
├── components/          # Vue components
├── pages/              # Nuxt pages (routing)
├── server/             # API routes and server logic
├── prisma/             # Database schema and migrations
├── locales/            # Internationalization files
├── config/             # Configuration files
└── docker-compose.yaml # Docker deployment
```

### Available Scripts

```bash
# Development
pnpm dev                # Start development server
pnpm build             # Build for production
pnpm preview           # Preview production build

# Database
pnpm prisma-migrate    # Run database migrations
pnpm prisma-generate   # Generate Prisma client
pnpm prisma-push       # Push schema changes
```

### Contributing

1. **Keep dependencies updated:** `pnpm install` after each `git pull`
2. **Run migrations:** `pnpm prisma-migrate` when schema changes
3. **Follow conventions:** Use TypeScript, Vue 3 Composition API, and Tailwind CSS
4. **Test thoroughly:** Verify both Docker and development setups

### Tech Stack

- **Frontend:** Nuxt 3, Vue 3, Nuxt UI, Tailwind CSS
- **Backend:** Nitro (Nuxt server), Prisma ORM
- **Database:** SQLite (development), PostgreSQL (production ready)
- **Vector DB:** ChromaDB, Milvus
- **AI/ML:** LangChain, Ollama, OpenAI, Anthropic, Google AI
- **Deployment:** Docker, Docker Compose

## Join Our Community

Join our Discord community for support, discussions, and updates:

**[Discord Invite Link](https://discord.gg/TjhZGYv5pC)**

- **#technical-discussion** - For contributors and technical discussions
- **#customer-support** - Get help with usage issues and troubleshooting
- **#general** - Community chat and announcements

## License

[MIT License](LICENSE)
