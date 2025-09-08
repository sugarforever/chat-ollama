# Knowledge Base Configuration Guide

This guide explains how to configure the knowledge base feature in chat-ollama, including embedding models, Redis, and vector store setup.

## Overview

The knowledge base feature enables RAG (Retrieval-Augmented Generation) capabilities, allowing you to create searchable document repositories that can be queried during conversations. This requires several components:

- **Embedding models**: Convert text to vector embeddings
- **Vector store**: Store and search document embeddings (Chroma or Milvus)
- **Redis**: Caching and document storage
- **Database**: PostgreSQL/SQLite for metadata storage

## Enabling Knowledge Base Feature

Set the following environment variable to enable the feature:

```env
KNOWLEDGE_BASE_ENABLED=true
```

## Embedding Models Configuration

### OpenAI Embeddings

**Supported Models:**
- `text-embedding-3-large` (recommended for best quality)
- `text-embedding-3-small` (faster, good balance)
- `text-embedding-ada-002` (legacy model)

**Configuration:**
```env
OPENAI_API_KEY=your-openai-api-key
```

**Usage Example:**
The system will automatically detect and use OpenAI embedding models when available. The model selection happens dynamically based on your configuration.

### Google Gemini Embeddings

**Supported Models:**
- `text-embedding-004`

**Configuration:**
```env
GOOGLE_API_KEY=your-google-api-key
```

### Ollama Embeddings

You can also use any embedding model served through Ollama. The system will automatically detect Ollama-served models that aren't explicitly listed in the OpenAI or Gemini model lists.

**Setup:**
1. Install and run Ollama
2. Pull an embedding model: `ollama pull nomic-embed-text`
3. The model will be available in the chat-ollama interface

## Vector Store Configuration

### Chroma (Default)

Chroma is the default vector store and is recommended for most setups.

**Configuration:**
```env
VECTOR_STORE=chroma
CHROMADB_URL=http://localhost:8000
```

**Docker Setup:**
```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### Milvus

For larger scale deployments, you can use Milvus as the vector store.

**Configuration:**
```env
VECTOR_STORE=milvus
MILVUS_URL=http://localhost:19530
```

**Docker Setup:**
```bash
# Download Milvus docker compose
curl -sfL https://raw.githubusercontent.com/milvus-io/milvus/master/scripts/standalone_embed.sh -o standalone_embed.sh
chmod +x standalone_embed.sh
./standalone_embed.sh start
```

## Redis Configuration

Redis is used for caching and document storage in the knowledge base system.

**Basic Configuration:**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Advanced Configuration:**
```env
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_USERNAME=your-username  # optional
REDIS_PASSWORD=your-password  # optional
```

**Docker Setup:**
```bash
docker run -d -p 6379:6379 redis:latest
```

## Complete Setup Example

### Using Docker Compose

Here's a complete example using Docker Compose for all services:

```yaml
version: '3.8'
services:
  chat-ollama:
    image: chat-ollama:latest
    ports:
      - "3000:3000"
    environment:
      - KNOWLEDGE_BASE_ENABLED=true
      - VECTOR_STORE=chroma
      - CHROMADB_URL=http://chroma:8000
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - OPENAI_API_KEY=your-openai-api-key
    depends_on:
      - chroma
      - redis
      - postgres

  chroma:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chroma_data:/chroma/chroma

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: chatollama
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  chroma_data:
  redis_data:
  postgres_data:
```

### Local Development Setup

For local development, you can run the services individually:

1. **Start Chroma:**
   ```bash
   docker run -d -p 8000:8000 -v chroma_data:/chroma/chroma chromadb/chroma
   ```

2. **Start Redis:**
   ```bash
   docker run -d -p 6379:6379 -v redis_data:/data redis:7-alpine
   ```

3. **Configure environment:**
   ```env
   KNOWLEDGE_BASE_ENABLED=true
   VECTOR_STORE=chroma
   CHROMADB_URL=http://localhost:8000
   REDIS_HOST=localhost
   REDIS_PORT=6379
   OPENAI_API_KEY=your-openai-api-key
   ```

## Usage

Once configured, the knowledge base feature will be available in the chat interface:

1. **Create a Knowledge Base:**
   - Go to the knowledge base section in the interface
   - Create a new knowledge base with a name and description
   - Upload documents (PDF, TXT, MD, etc.)

2. **Select Knowledge Base in Chat:**
   - In chat settings, select the knowledge base you want to use
   - The system will use RAG to find relevant documents for your queries

3. **Document Processing:**
   - Documents are automatically chunked and embedded
   - Embeddings are stored in your chosen vector store
   - Metadata is stored in the database

## Troubleshooting

### Common Issues

1. **"Knowledge base feature not enabled"**
   - Ensure `KNOWLEDGE_BASE_ENABLED=true` in your environment
   - Restart the application after changing the environment variable

2. **Vector store connection errors**
   - Verify your vector store (Chroma/Milvus) is running and accessible
   - Check the URL configuration matches your setup

3. **Redis connection errors**
   - Ensure Redis is running and accessible
   - Verify Redis host, port, and credentials

4. **Embedding model errors**
   - Verify your API keys are correct and have sufficient credits
   - Check that the embedding model you're trying to use is supported

### Performance Optimization

- **Embedding Model Selection**: `text-embedding-3-small` offers good performance/cost balance
- **Vector Store**: Chroma is suitable for most use cases; use Milvus for large-scale deployments
- **Document Chunking**: The system automatically optimizes chunk sizes for better retrieval

## Security Considerations

- Store API keys securely and never commit them to version control
- Use environment variables or secure secret management systems
- Consider network security for Redis and vector store connections
- Regularly update dependencies and monitor for security updates

## Advanced Configuration

### Custom Embedding Dimensions

For OpenAI `text-embedding-3` models, you can specify custom dimensions:

```javascript
// This is handled automatically by the system based on model capabilities
// The system will use optimal dimensions for each model type
```

### Batch Processing

The system automatically batches embedding requests for optimal performance:
- OpenAI: Up to 512 documents per batch
- Gemini: Optimized batch sizes based on API limits
- Ollama: Single document processing

### Reranking (Optional)

For improved search results, you can configure Cohere reranking:

```env
COHERE_API_KEY=your-cohere-api-key
COHERE_MODEL=rerank-english-v3.0
```

This guide should help you set up and configure the knowledge base feature effectively. For additional support, refer to the application logs and ensure all services are running correctly.