[English](README.md) | 简体中文

# ChatOllama

`ChatOllama` 是一个基于 LLMs（大语言模型）的开源聊天机器人平台，支持多种语言模型，包括：

- Ollama 服务模型
- OpenAI
- Azure OpenAI
- Anthropic
- Moonshot
- Gemini
- Groq

`ChatOllama` 支持多种聊天类型：

- 与 LLMs 免费聊天
- 基于知识库与 LLMs 聊天

`ChatOllama` 的功能列表：

- Ollama 模型管理
- 知识库管理
- 聊天
- 商业 LLMs API 密钥管理

## 加入我们的社区

如果您是用户、贡献者或只是对 `ChatOllama` 感兴趣的人，您都欢迎加入我们的 Discord 社群，点击以下链接邀请链接 [https://discord.gg/TjhZGYv5pC](https://discord.gg/TjhZGYv5pC)。

如果您是贡献者，请关注频道 `technical-discussion`，讨论技术相关问题。

如果您在使用 `ChatOllama` 遇到问题，请报告到频道 `customer-support`。我们将尽快帮助您解决问题。

## 快速启动

作为 `ChatOllama` 的用户，请按照以下文档步骤，确保您从头到尾了解了所有组件的设置，然后才能使用 `ChatOllama`。

### 支持的向量数据库

`ChatOllama` 支持 2 种向量数据库：Milvus 和 Chroma。

请参阅 `.env.example` 文件，了解如何使用向量数据库配置。

```
# 支持的值：chroma，milvus
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000
MILVUS_URL=http://localhost:19530
```

默认情况下，`ChatOllama` 使用了 Chroma。如果您想使用 Milvus，请将 `VECTOR_STORE` 设置为 `milvus`，并指定相应的 URL。它在开发服务器和 Docker 容器中都可用。

### 使用 Nuxt 3 开发服务器

如果您想在最新的代码库中运行，并且可以实时应用更改，clone 该存储库，并按照以下步骤进行：

1. 安装 Ollama 服务器

    您需要运行 Ollama 服务器。按照 [Ollama](https://github.com/ollama/ollama) 的安装指南进行安装。默认情况下，它运行在 http://localhost:11434。

2. 安装 Chroma

    请参阅 [https://docs.trychroma.com/getting-started](https://docs.trychroma.com/getting-started) 获取 Chroma 安装指南。

    我们建议在 Docker 容器中运行：

    ```bash
    # https://hub.docker.com/r/chromadb/chroma/tags

    docker pull chromadb/chroma
    docker run -d -p 8000:8000 chromadb/chroma
    ```
    现在，ChromaDB 正在运行于 http://localhost:8000

3. ChatOllama 设置

    现在，我们可以完成必要的设置，以便运行 ChatOllama。

    3.1 复制 `.env.example` 文件到 `.env` 文件：

    ```bash
    cp .env.example .env
    ```

    3.2 确保安装依赖项：

    ```bash
    pnpm install
    ```

    3.3 运行迁移命令以创建数据库表：

    ```bash
    pnpm prisma-migrate
    ```

4. 启动开发服务器

    > 确保 __[Ollama Server](#ollama-server)__  服务器和 __[ChromaDB](#install-chromadb-and-startup)__  都正在运行。

    启动开发服务器在 `http://localhost:3000`：

    ```bash
    pnpm dev
    ```

### 使用 Docker

这是使用 `ChatOllama` 的最简单方法。

唯一需要的是复制一份 [docker-compose.yaml](./docker-compose.yaml)。请下载它，并执行以下命令以启动 `ChatOllama`：

```shell
$ docker compose up
```

由于 `ChatOllama` 在 Docker 容器中运行，您需要将 Ollama 服务器设置为 `http://host.docker.internal:11434`，假设您的 Ollama 服务器在本地运行默认端口。

如果这是您第一次在 Docker 中启动 `ChatOllama`，请初始化 SQLite 数据库：

```shell
$ docker compose exec chatollama npx prisma migrate dev
```

#### 使用知识库的提前准备

使用知识库时，我们需要一个有效的嵌入模型。在这里可以是 Ollama 下载的模型或来自第三方服务提供商，例如 OpenAI。

**Ollama 管理嵌入模型**

我们推荐使用 `nomic-embed-text` 模型。

可以在 Models 页面 [http://localhost:3000/models](http://localhost:3000/models) 或使用 CLI 进行下载：

```shell
# 在 docker-compose.yaml 文件夹中

$ docker compose exec ollama ollama pull nomic-embed-text:latest
```

**OpenAI 嵌入模型**

如果您想使用 OpenAI，请确保您设置了有效的 OpenAI API 密钥，并选择以下之一的 OpenAI 嵌入模型：

- `text-embedding-3-large`
- `text-embedding-3-small`
- `text-embedding-ada-002`

#### Docker 容器数据存储

有两个类型的数据存储：向量数据和关系数据。详细信息请参阅 [docker-compose.yaml](./docker-compose.yaml)。

##### 向量数据

使用 `docker-compose.yaml`，会在同一 Docker 容器中运行 Chroma 数据库。数据将被 保存在 Docker 卷中。

##### 关系数据

关系数据，包括知识库记录及其关联文件，存储在 SQLite 数据库文件中，保存在 `~/.chatollama/chatollama.sqlite`。

#### 代理

我们提供了代理配置功能。对于特定的使用，请点击 [这里](docs/proxy-usage.md)。

## 开发者指南

由于 `ChatOllama` 处于快速开发中，特性、接口和数据库架构可能会发生变化。请在每次 `git pull` 时，确保您的依赖项和数据库架构始终保持同步。

1. 安装最新依赖项
    - `pnpm install`
2. Prisma 迁移
    - `pnpm prisma-migrate`
