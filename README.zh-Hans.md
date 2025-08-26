[English](README.md) | 简体中文

# ChatOllama

> **🔐 新增 ACL 功能 (2025-08-25):** MCP 服务器管理访问控制列表（ACL）！通过 `ACL_ENABLED` 环境变量控制谁可以配置 MCP 服务器。[了解更多 ACL 配置 →](#mcp-服务器管理权限)

> **🤖 深度智能体支持 (2025-08-19)：** ChatOllama 现在支持具有工具访问能力的 AI 智能体！目前需要 Anthropic API 密钥，请参考 `.env.example`，在 `.env` 中添加 `ANTHROPIC_API_KEY`。工具通过 MCP 设置进行配置。访问 `/agents` 开始使用。

> **📢 数据库迁移通知 (2025-08-14)：** ChatOllama 已从 SQLite 迁移到 PostgreSQL 作为主要数据库提供商，以获得更好的性能和可扩展性。

`ChatOllama` 是一个基于 Nuxt 3 构建的开源聊天机器人平台，支持多种语言模型和高级功能，包括知识库、实时语音聊天和模型上下文协议 (MCP) 集成。

## 支持的语言模型

- **OpenAI** / **Azure OpenAI**
- **Anthropic**
- **Google Gemini**
- **Groq**
- **月之暗面 (Moonshot)**
- **Ollama**
- **OpenAI API 兼容服务提供商**

## 主要功能

- **AI 智能体** - 具有工具访问能力的智能代理，用于研究和任务执行
- **多模态聊天** - 支持文本和图像输入
- **知识库** - RAG（检索增强生成）与文档上传
- **实时语音聊天** - 与 Gemini 2.0 Flash 进行语音对话
- **模型上下文协议 (MCP)** - 可扩展的工具集成
- **向量数据库** - 支持 Chroma 和 Milvus
- **Docker 支持** - 使用 Docker Compose 轻松部署
- **国际化** - 多语言支持

## 快速启动

选择您偏好的部署方式：

### 方式一：Docker（推荐）

最简单的入门方式。下载 [docker-compose.yaml](./docker-compose.yaml) 并运行：

```bash
docker compose up
```

在 http://localhost:3000 访问 ChatOllama

### 方式二：开发环境设置

用于开发或自定义：

1. **前置要求**
   - Node.js 18+ 和 pnpm
   - 本地 PostgreSQL 数据库服务器
   - Ollama 服务器运行在 http://localhost:11434
   - ChromaDB 或 Milvus 向量数据库

2. **安装**
   ```bash
   git clone git@github.com:sugarforever/chat-ollama.git
   cd chat-ollama
   cp .env.example .env
   pnpm install
   ```

3. **数据库设置**
   - 创建 PostgreSQL 数据库
   - 在 `.env` 中配置数据库 URL
   - 运行迁移：`pnpm prisma migrate deploy`

4. **启动开发**
   ```bash
   pnpm dev
   ```

## 从 SQLite 迁移到 PostgreSQL

如果您正在从使用 SQLite 的旧版本升级，请按照以下步骤迁移数据：

### Docker 用户

**无需任何操作！** Docker 部署会自动处理迁移：
- PostgreSQL 服务自动启动
- 数据库迁移在容器启动时运行
- 您的现有数据将被保留

### 开发环境用户

1. **备份现有的 SQLite 数据**（如果您有重要的聊天记录）：
   ```bash
   cp chatollama.sqlite chatollama.sqlite.backup
   ```

2. **安装和设置 PostgreSQL**：
   ```bash
   # macOS 使用 Homebrew
   brew install postgresql
   brew services start postgresql
   
   # 创建数据库和用户
   psql postgres
   CREATE DATABASE chatollama;
   CREATE USER chatollama WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE chatollama TO chatollama;
   \q
   ```

3. **更新您的 `.env` 文件**：
   ```bash
   # 将 SQLite URL 替换为 PostgreSQL
   DATABASE_URL="postgresql://chatollama:your_password@localhost:5432/chatollama"
   ```

4. **运行数据库迁移**：
   ```bash
   pnpm prisma migrate deploy
   ```

5. **迁移现有的 SQLite 数据**（如果您有需要保留的聊天记录）：
   ```bash
   pnpm migrate:sqlite-to-postgres
   ```

### 向量数据库配置

ChatOllama 支持两种向量数据库。在 `.env` 文件中配置：

```bash
# 选择：chroma 或 milvus
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000
MILVUS_URL=http://localhost:19530
```

**ChromaDB 设置（默认）**
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

## 配置

### 环境变量

`.env` 中的关键配置选项：

```bash
# 数据库
DATABASE_URL=file:../../chatollama.sqlite

# 服务器
PORT=3000
HOST=

# 向量数据库
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000

# 可选：商业模型的 API 密钥
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
MOONSHOT_API_KEY=your_moonshot_key

# 可选：代理设置
NUXT_PUBLIC_MODEL_PROXY_ENABLED=false
NUXT_MODEL_PROXY_URL=http://127.0.0.1:1080

# 可选：Cohere 用于重排序
COHERE_API_KEY=your_cohere_key
```

## 功能开关（Docker 与 .env）

可以通过功能开关启用或禁用主要产品模块。它们可以在构建时通过 `.env` 设置，也可以在 Docker 运行时通过带有 `NUXT_` 前缀的变量设置。

- **可用功能**
  - **MCP（模型上下文协议）** → 控制「设置 → MCP」模块。标志：`mcpEnabled`
  - **知识库** → 控制知识库菜单与页面。标志：`knowledgeBaseEnabled`
  - **实时聊天** → 控制 `/realtime` 语音聊天页面。标志：`realtimeChatEnabled`
  - **模型管理** → 控制「模型」菜单与 `/models` 页面。标志：`modelsManagementEnabled`

- **Docker（部署环境推荐）**
  在 `docker-compose.yaml` 中通过 `NUXT_` 变量进行运行时覆盖：
  
  ```yaml
  services:
    chatollama:
      environment:
        - NUXT_MCP_ENABLED=true
        - NUXT_KNOWLEDGE_BASE_ENABLED=true
        - NUXT_REALTIME_CHAT_ENABLED=true
        - NUXT_MODELS_MANAGEMENT_ENABLED=true
  ```

- **.env（在执行 `pnpm build` 的构建时）**
  如果本地构建（非 Docker）或自定义镜像，可以设置：
  
  ```bash
  MCP_ENABLED=true
  KNOWLEDGE_BASE_ENABLED=true
  REALTIME_CHAT_ENABLED=true
  MODELS_MANAGEMENT_ENABLED=true
  ```

  注意：这些值在构建 `nuxt.config.ts` 时生效。对于预构建的 Docker 镜像，优先使用上面的 `NUXT_` 变量在运行时覆盖。

- **说明**
  - `NUXT_` 变量在运行时直接映射到 `runtimeConfig` 键，在容器环境中更优先。
  - 在 Compose 中使用 `MCP_ENABLED=true` 不能覆盖预构建镜像的 `runtimeConfig`；请使用 `NUXT_MCP_ENABLED=true`。

## 高级功能

### 模型上下文协议 (MCP)

ChatOllama 集成了 MCP，通过外部工具和数据源扩展 AI 功能。MCP 服务器通过设置中的用户友好界面进行管理。

#### MCP 服务器管理权限

ChatOllama 为 MCP 服务器管理提供灵活的访问控制，以支持开发和生产环境。

**权限模式：**
- **`ACL_ENABLED=false`（默认）**：开放访问 - 所有用户都可以管理 MCP 服务器
- **`ACL_ENABLED=true`**：限制访问 - 只有管理员/超级管理员用户可以管理 MCP 服务器

**🔧 开发与个人使用（推荐：ACL_ENABLED=false）**
```bash
# .env 文件
ACL_ENABLED=false
```

**按角色划分的用户体验：**

| 用户类型 | ACL_ENABLED=false | ACL_ENABLED=true |
|----------|-------------------|------------------|
| **未认证用户** | ✅ 完整 MCP 访问 | ❌ 需要管理员权限 |
| **普通用户** | ✅ 完整 MCP 访问 | ❌ 需要管理员权限 |
| **管理员** | ✅ 完整 MCP 访问 | ✅ 完整 MCP 访问 |
| **超级管理员** | ✅ 完整 MCP 访问 | ✅ 完整 MCP 访问 |

**重要说明：**
- **MCP 工具使用**：无论 ACL 设置如何，所有用户都可以在聊天中使用已配置的 MCP 工具
- **向后兼容性**：现有安装继续工作而无需更改
- **安全迁移**：可以随时通过设置 `ACL_ENABLED=true` 启用 ACL

**支持的传输类型：**
- **STDIO** - 命令行工具（最常用）
- **服务器发送事件 (SSE)** - 基于 HTTP 的流式传输
- **流式 HTTP** - 基于 HTTP 的通信

**通过设置界面配置：**
1. 导航到 **设置 → MCP**
2. 点击 **"添加服务器"** 创建新的 MCP 服务器
3. 配置服务器详情：
   - **名称**：描述性服务器名称
   - **传输类型**：选择 STDIO、SSE 或流式 HTTP
   - **命令/参数** (STDIO)：可执行文件路径和参数
   - **URL** (SSE/HTTP)：服务器端点 URL
   - **环境变量**：API 密钥和配置
   - **启用/禁用**：切换服务器状态

**STDIO 服务器示例：**
```
名称: 文件系统工具
传输类型: stdio
命令: uvx
参数: mcp-server-filesystem
环境变量:
  PATH: ${PATH}
```

**从旧配置迁移：**
如果您有现有的 `.mcp-servers.json` 文件：
```bash
pnpm exec ts-node scripts/migrate-mcp-servers.ts
```

**热门 MCP 服务器：**
- `mcp-server-filesystem` - 文件系统操作
- `mcp-server-git` - Git 仓库管理
- `mcp-server-sqlite` - SQLite 数据库查询
- `mcp-server-brave-search` - 网络搜索功能

**MCP 在聊天中的工作原理：**
当 MCP 服务器启用时，它们的工具在对话中对 AI 模型可用。AI 可以自动调用这些工具来：
- 在讨论代码时读取/写入文件
- 搜索网络获取最新信息
- 查询数据库获取特定数据
- 根据需要执行系统操作

工具动态加载并无缝集成到聊天体验中。

#### MCP 权限故障排除

**常见问题及解决方案：**

1. **出现"需要管理员权限"消息：**
   - **原因**：`ACL_ENABLED=true` 且用户缺乏管理员权限
   - **解决方案**：禁用 ACL 或将用户提升为管理员
   ```bash
   # 选项 1：禁用 ACL（开发环境）
   ACL_ENABLED=false
   
   # 选项 2：将用户提升为管理员（联系超级管理员）
   ```

2. **启用 ACL 后无法访问 MCP 设置：**
   - **原因**：不存在管理员账户
   - **解决方案**：创建超级管理员账户
   ```bash
   # 在首次用户注册前设置
   SUPER_ADMIN_NAME=admin-username
   ```

3. **MCP 工具在聊天中不工作：**
   - **原因**：MCP 功能被禁用或服务器配置错误
   - **解决方案**：检查 MCP 功能开关和服务器状态
   ```bash
   # 启用 MCP 功能
   NUXT_MCP_ENABLED=true  # Docker
   MCP_ENABLED=true       # .env
   ```

4. **权限更改未生效：**
   - **原因**：浏览器缓存或会话问题
   - **解决方案**：退出登录后重新登录，或重启应用程序

## 用户管理与管理员设置

### 创建超级管理员账户

**设置 SUPER_ADMIN_NAME 之前：**
- 第一个注册的用户自动成为超级管理员

**设置 SUPER_ADMIN_NAME 之后：**
- 只有指定用户名的用户在注册时才会成为超级管理员
- 在 `.env` 文件中设置：`SUPER_ADMIN_NAME=your-admin-username`
- 或在 Docker 中：添加到环境变量

**管理现有用户：**
- 使用提升脚本工具来管理超级管理员角色：
  ```bash
  # 将现有用户提升为超级管理员
  pnpm promote-super-admin username_or_email
  
  # 列出当前的超级管理员
  pnpm promote-super-admin --list
  ```

### 管理用户角色

**超级管理员能力：**
- 将普通用户提升为管理员
- 管理所有 MCP 服务器（当启用 ACL 时）
- 访问用户管理界面
- 配置系统范围的设置

**管理员能力：**
- 管理 MCP 服务器（当启用 ACL 时）
- 无法提升其他用户

**普通用户能力：**
- 使用所有聊天功能和 MCP 工具
- 管理 MCP 服务器（仅当 ACL 禁用时）

### 生产环境安全建议

```bash
# 推荐的生产环境设置
ACL_ENABLED=false          # 默认：开放 MCP 管理访问
SUPER_ADMIN_NAME=admin     # 设置超级管理员用户名
AUTH_SECRET=your-long-random-secret-key-here
```

### 实时语音聊天

启用与 Gemini 2.0 Flash 的语音对话：

1. 在设置中设置您的 Google API 密钥
2. 在设置中启用"实时聊天"
3. 点击麦克风图标开始语音对话
4. 通过 `/realtime` 页面访问

### 知识库

创建知识库进行 RAG 对话：

1. **创建知识库** - 命名并配置分块参数
2. **上传文档** - 支持 PDF、DOCX、TXT 文件
3. **与知识聊天** - 在对话中引用您的文档

**支持的向量数据库：**
- **ChromaDB**（默认）- 轻量级，易于设置
- **Milvus** - 生产级向量数据库

### 数据存储

**Docker 部署：**
- **向量数据** - 存储在 Docker 卷中（chromadb_volume）
- **关系数据** - SQLite 数据库位于 `~/.chatollama/chatollama.sqlite`
- **Redis** - 会话和缓存数据

**开发环境：**
- **数据库** - 本地 SQLite 文件
- **向量存储** - 外部 ChromaDB/Milvus 实例

## 开发

### 项目结构

```
chatollama/
├── components/          # Vue 组件
├── pages/              # Nuxt 页面（路由）
├── server/             # API 路由和服务器逻辑
├── prisma/             # 数据库模式和迁移
├── locales/            # 国际化文件
├── config/             # 配置文件
└── docker-compose.yaml # Docker 部署
```

### 可用脚本

```bash
# 开发
pnpm dev                # 启动开发服务器
pnpm build             # 构建生产版本
pnpm preview           # 预览生产构建

# 数据库
pnpm prisma-migrate    # 运行数据库迁移
pnpm prisma-generate   # 生成 Prisma 客户端
pnpm prisma-push       # 推送模式更改

# 用户管理
pnpm promote-super-admin <用户名|邮箱>  # 将用户提升为超级管理员
pnpm promote-super-admin --list        # 列出所有超级管理员
```

### 贡献

1. **保持依赖项更新：** 每次 `git pull` 后运行 `pnpm install`
2. **运行迁移：** 当模式更改时运行 `pnpm prisma-migrate`
3. **遵循约定：** 使用 TypeScript、Vue 3 Composition API 和 Tailwind CSS
4. **彻底测试：** 验证 Docker 和开发环境设置

### 技术栈

- **前端：** Nuxt 3、Vue 3、Nuxt UI、Tailwind CSS
- **后端：** Nitro（Nuxt 服务器）、Prisma ORM
- **数据库：** SQLite（开发）、PostgreSQL（生产就绪）
- **向量数据库：** ChromaDB、Milvus
- **AI/ML：** LangChain、Ollama、OpenAI、Anthropic、Google AI
- **部署：** Docker、Docker Compose

## 加入我们的社区

加入我们的 Discord 社区获取支持、讨论和更新：

**[Discord 邀请链接](https://discord.gg/TjhZGYv5pC)**

- **#technical-discussion** - 贡献者和技术讨论
- **#customer-support** - 获取使用问题和故障排除帮助
- **#general** - 社区聊天和公告

## 许可证

[MIT 许可证](LICENSE)
