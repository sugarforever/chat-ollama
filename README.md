English | [简体中文](README.zh-Hans.md)

# ChatOllama + Deep Agents

> **🔐 New ACL Feature (2025-08-25):** Access Control Lists (ACL) for MCP server management! Control who can configure MCP servers with `ACL_ENABLED` environment variable. [Learn more about ACL configuration →](#mcp-server-management-permissions)

> **🤖 Deep Agents Support (2025-08-19):** ChatOllama now supports AI Agents with tool access! Currently requires Anthropic API key. Please refer to `.env.example` and set `ANTHROPIC_API_KEY` in `.env`. Tools are configured through MCP settings. Visit `/agents` to get started.

> **📢 Database Migration Notice (2025-08-14):** ChatOllama has moved from SQLite to PostgreSQL as the primary database provider for better performance and scalability.

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

- **AI Agents** - Intelligent agents with tool access for research and task execution
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

Access ChatOllama at http://localhost:3000

### Option 2: Development Setup

For development or customization:

1. **Prerequisites**
   - Node.js 18+ and pnpm
   - Local PostgreSQL database server
   - Ollama server running on http://localhost:11434
   - ChromaDB or Milvus vector database

2. **Installation**
   ```bash
   git clone git@github.com:sugarforever/chat-ollama.git
   cd chat-ollama
   cp .env.example .env
   pnpm install
   ```

3. **Database Setup**
   - Create a PostgreSQL database
   - Configure the database URL in `.env`
   - Run migrations: `pnpm prisma migrate deploy`

4. **Start Development**
   ```bash
   pnpm dev
   ```

## Data Migration from SQLite to PostgreSQL

If you're upgrading from a previous version that used SQLite, follow these steps to migrate your data:

### For Docker Users

**No action required!** Docker deployments handle the migration automatically:
- The PostgreSQL service starts automatically
- Database migrations run on container startup
- Your existing data will be preserved

### For Development Users

1. **Backup your existing SQLite data** (if you have important chat history):
   ```bash
   cp chatollama.sqlite chatollama.sqlite.backup
   ```

2. **Install and setup PostgreSQL**:
   ```bash
   # macOS with Homebrew
   brew install postgresql
   brew services start postgresql
   
   # Create database and user
   psql postgres
   CREATE DATABASE chatollama;
   CREATE USER chatollama WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE chatollama TO chatollama;
   \q
   ```

3. **Update your `.env` file**:
   ```bash
   # Replace SQLite URL with PostgreSQL
   DATABASE_URL="postgresql://chatollama:your_password@localhost:5432/chatollama"
   ```

4. **Run database migrations**:
   ```bash
   pnpm prisma migrate deploy
   ```

5. **Migrate existing SQLite data** (if you have chat history to preserve):
   ```bash
   pnpm migrate:sqlite-to-postgres
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
# Access Control
ACL_ENABLED=false  # Set to 'true' for production (admin-only MCP management)

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

## Feature Flags (Docker and .env)

You can enable or disable major product areas via feature flags. These can be set at build time using `.env`, or at runtime in Docker using `NUXT_`-prefixed variables.

- **Available features**
  - **MCP (Model Context Protocol)** → toggles `Settings → MCP` module. Flag: `mcpEnabled`
  - **Knowledge Bases** → toggles Knowledge Bases menu and pages. Flag: `knowledgeBaseEnabled`
  - **Realtime Chat** → toggles `/realtime` voice chat page. Flag: `realtimeChatEnabled`
  - **Models Management** → toggles `Models` menu and `/models` page. Flag: `modelsManagementEnabled`

- **Docker (recommended for deployments)**
  Set runtime overrides with `NUXT_` variables in `docker-compose.yaml`:
  
  ```yaml
  services:
    chatollama:
      environment:
        - NUXT_MCP_ENABLED=true
        - NUXT_KNOWLEDGE_BASE_ENABLED=true
        - NUXT_REALTIME_CHAT_ENABLED=true
        - NUXT_MODELS_MANAGEMENT_ENABLED=true
  ```

- **.env (build time during `pnpm build`)**
  If you are building locally (non-Docker) or creating a custom image, you can set:
  
  ```bash
  MCP_ENABLED=true
  KNOWLEDGE_BASE_ENABLED=true
  REALTIME_CHAT_ENABLED=true
  MODELS_MANAGEMENT_ENABLED=true
  ```

  Note: These are evaluated when `nuxt.config.ts` is built. For prebuilt Docker images, prefer the `NUXT_` variables above to override at runtime.

- **Notes**
  - `NUXT_` variables map directly to `runtimeConfig` keys at runtime and take precedence in containers.
  - Using `MCP_ENABLED=true` in Compose will not override a prebuilt image’s `runtimeConfig`; use `NUXT_MCP_ENABLED=true` instead.

## Advanced Features

### Model Context Protocol (MCP)

ChatOllama integrates with MCP to extend AI capabilities through external tools and data sources. MCP servers are managed through a user-friendly interface in Settings.

#### MCP Server Management Permissions

ChatOllama provides flexible access control for MCP server management to support both development and production environments.

**Permission Modes:**
- **`ACL_ENABLED=false` (default)**: Open access - all users can manage MCP servers
- **`ACL_ENABLED=true`**: Restricted access - only admin/superadmin users can manage MCP servers

**🔧 Development & Personal Use (Recommended: ACL_ENABLED=false)**
```bash
# .env file
ACL_ENABLED=false
```

**User Experience by Role:**

| User Type | ACL_ENABLED=false | ACL_ENABLED=true |
|-----------|-------------------|------------------|
| **Unauthenticated** | ✅ Full MCP access | ❌ Admin required |
| **Regular User** | ✅ Full MCP access | ❌ Admin required |
| **Admin** | ✅ Full MCP access | ✅ Full MCP access |
| **Super Admin** | ✅ Full MCP access | ✅ Full MCP access |

**Important Notes:**
- **MCP Tool Usage**: All users can use configured MCP tools in chat regardless of ACL setting
- **Backward Compatibility**: Existing installations continue working without changes
- **Migration Safe**: Enable ACL anytime by setting `ACL_ENABLED=true`

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

#### Troubleshooting MCP Permissions

**Common Issues and Solutions:**

1. **"Admin access required" message appears:**
   - **Cause**: `ACL_ENABLED=true` and user lacks admin privileges
   - **Solution**: Either disable ACL or promote user to admin
   ```bash
   # Option 1: Disable ACL (development)
   ACL_ENABLED=false
   
   # Option 2: Promote user to admin (contact super admin)
   ```

2. **Cannot access MCP settings after enabling ACL:**
   - **Cause**: No admin account exists
   - **Solution**: Create super admin account
   ```bash
   # Set before first user signup
   SUPER_ADMIN_NAME=admin-username
   ```

3. **MCP tools not working in chat:**
   - **Cause**: MCP feature disabled or servers misconfigured
   - **Solution**: Check MCP feature flag and server status
   ```bash
   # Enable MCP feature
   NUXT_MCP_ENABLED=true  # Docker
   MCP_ENABLED=true       # .env
   ```

4. **Permission changes not taking effect:**
   - **Cause**: Browser cache or session issue
   - **Solution**: Logout and login again, or restart application

## User Management & Admin Setup

### Creating Super Admin Account

**Before setting SUPER_ADMIN_NAME:**
- The first user to sign up automatically becomes super admin

**After setting SUPER_ADMIN_NAME:**
- Only the user with the specified username becomes super admin when they sign up
- Set in `.env` file: `SUPER_ADMIN_NAME=your-admin-username`
- Or in Docker: add to environment variables

**Managing existing users:**
- Use the promotion script tool to manage super admin roles:
  ```bash
  # Promote existing user to super admin
  pnpm promote-super-admin username_or_email
  
  # List current super admins
  pnpm promote-super-admin --list
  ```

### Managing User Roles

**Super Admin Capabilities:**
- Promote regular users to admin
- Manage all MCP servers (when ACL enabled)
- Access user management interface
- Configure system-wide settings

**Admin Capabilities:**
- Manage MCP servers (when ACL enabled)
- Cannot promote other users

**Regular User Capabilities:**
- Use all chat features and MCP tools
- Manage MCP servers (only when ACL disabled)

### Production Security Recommendations

```bash
# Recommended production settings
ACL_ENABLED=false          # Default: open access to MCP management
SUPER_ADMIN_NAME=admin     # Set super admin username
AUTH_SECRET=your-long-random-secret-key-here
```

### Realtime Voice Chat

Enable voice conversations with Gemini 2.0 Flash:

1. Set your Google API key in Settings
2. Enable "Realtime Chat" in Settings  
3. Click the microphone icon to start voice conversations
4. Access via `/realtime` page

### Knowledge Bases

Create searchable document repositories for enhanced conversations using RAG (Retrieval Augmented Generation):

1. **Enable Feature**: Set `KNOWLEDGE_BASE_ENABLED=true`
2. **Setup Dependencies**: Vector store (Chroma/Milvus) + Redis + Embedding models
3. **Create & Upload**: Build knowledge bases with your documents
4. **Chat Enhanced**: AI references your documents automatically

**📖 [Complete Configuration Guide →](docs/guide/knowledge-base-configuration.md)**

Quick setup with Docker:
```bash
# All services included in docker-compose.yaml
docker compose up
```

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

# User Management
pnpm promote-super-admin <username|email>  # Promote user to super admin
pnpm promote-super-admin --list            # List all super admins
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
