[English](README.md) | 简体中文

# ChatOllama

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

首次运行时初始化数据库：
```bash
docker compose exec chatollama npx prisma migrate dev
```

在 http://localhost:3000 访问 ChatOllama

### 方式二：开发环境设置

用于开发或自定义：

1. **前置要求**
   - Node.js 18+ 和 pnpm
   - Ollama 服务器运行在 http://localhost:11434
   - ChromaDB 或 Milvus 向量数据库

2. **安装**
   ```bash
   git clone git@github.com:sugarforever/chat-ollama.git
   cd chat-ollama
   cp .env.example .env
   pnpm install
   pnpm prisma-migrate
   pnpm dev
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

## 高级功能

### 模型上下文协议 (MCP)

ChatOllama 集成了 MCP，通过外部工具和数据源扩展 AI 功能。MCP 服务器通过设置中的用户友好界面进行管理。

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
