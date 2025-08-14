# Docker Container Automatic Migration Guide

This guide explains how Chat-Ollama automatically handles SQLite to PostgreSQL migration when using Docker containers.

## 🚀 How It Works

When you start a Chat-Ollama container with PostgreSQL configured, the system automatically:

1. **Waits for PostgreSQL** - Ensures the database is ready before proceeding
2. **Sets up database schema** - Runs Prisma migrations to create/update tables
3. **Detects SQLite data** - Looks for existing SQLite databases in mounted volumes
4. **Migrates data automatically** - Safely transfers all data to PostgreSQL
5. **Marks SQLite as migrated** - Renames SQLite file to prevent re-migration
6. **Starts the application** - Launches Chat-Ollama with PostgreSQL

## 📁 SQLite Detection Locations

The migration system automatically searches for SQLite databases in these locations:
- `/app/data/chatollama.sqlite` (recommended volume mount)
- `/app/sqlite/chatollama.sqlite` (legacy location)  
- `/app/chatollama.sqlite` (container root)

## ⚙️ Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SKIP_MIGRATION` | `false` | Set to `true` to disable automatic migration |
| `MIGRATION_TIMEOUT` | `300` | Migration timeout in seconds |

### Example Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=chatollama
      - POSTGRES_USER=chatollama
      - POSTGRES_PASSWORD=chatollama_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatollama -d chatollama"]
      interval: 10s
      timeout: 5s
      retries: 5

  chatollama:
    image: chat-ollama:latest
    environment:
      - DATABASE_URL=postgresql://chatollama:chatollama_password@postgres:5432/chatollama
      - SKIP_MIGRATION=false
      - MIGRATION_TIMEOUT=300
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ~/.chatollama:/app/data  # SQLite will be detected here
```

## 🔄 Migration Process Details

### 1. Startup Sequence
```
🚀 Container starts
🔍 Wait for PostgreSQL (up to 30s)
🗄️  Setup database schema (Prisma migrations)
📦 Detect SQLite database
🔄 Run migration (with timeout)
📁 Mark SQLite as migrated
🎉 Start application
```

### 2. What Gets Migrated
- ✅ **Users** - All user accounts and profiles
- ✅ **Instructions** - Custom instruction sets
- ✅ **Knowledge Bases** - Document collections
- ✅ **Authentication** - OAuth accounts and sessions
- ✅ **MCP Servers** - Model Context Protocol configurations

### 3. Safety Features
- **Non-destructive**: Existing PostgreSQL data is preserved
- **Idempotent**: Safe to run multiple times
- **Transactional**: All changes wrapped in database transactions
- **Backup**: SQLite file is renamed, not deleted
- **Error handling**: Container starts even if migration fails

## 🛡️ Safety Guarantees

### ✅ Multiple Container Restarts
- **First restart**: Detects SQLite, migrates to PostgreSQL
- **Subsequent restarts**: Skips migration (SQLite marked as migrated)
- **No data loss**: Existing data is preserved and merged safely

### ✅ Failed Migration Recovery
If migration fails:
- Container continues startup
- Application runs with existing PostgreSQL data
- SQLite file remains untouched
- Manual migration available: `docker exec <container> pnpm run migrate:sqlite-to-postgres`

### ✅ Concurrent Containers
- Multiple containers can start safely
- PostgreSQL handles concurrent connections
- Upsert operations prevent data conflicts
- Health checks ensure proper startup order

## 📋 Migration Scenarios

### Scenario 1: Fresh Installation
```
User starts container → PostgreSQL empty → No SQLite found → Normal startup
```

### Scenario 2: First Migration
```
User has SQLite data → Container detects SQLite → Migrates to PostgreSQL → Renames SQLite
```

### Scenario 3: Container Restart
```
SQLite already migrated → Container skips migration → Normal startup
```

### Scenario 4: Migration Disabled
```
SKIP_MIGRATION=true → Container skips migration → Uses existing PostgreSQL data
```

## 🔧 Manual Migration Commands

If you need to run migration manually:

```bash
# Inside container
pnpm run migrate:sqlite-to-postgres

# From host (if container is running)
docker exec <container-name> pnpm run migrate:sqlite-to-postgres

# With custom options
docker exec <container-name> pnpm run migrate:sqlite-to-postgres -- --dry-run
docker exec <container-name> pnpm run migrate:sqlite-to-postgres -- --sqlite-url file:/custom/path.sqlite
```

## 📊 Monitoring Migration

### Container Logs
The startup process provides detailed logging:

```
[2025-08-14 10:00:00] 🚀 Starting Chat-Ollama container initialization...
[2025-08-14 10:00:01] 🔍 Waiting for PostgreSQL to be ready...
[2025-08-14 10:00:03] ✅ PostgreSQL is ready
[2025-08-14 10:00:04] 🗄️ Setting up database schema...
[2025-08-14 10:00:06] ✅ Database schema is up-to-date
[2025-08-14 10:00:07] 📦 SQLite database found - initiating migration to PostgreSQL
[2025-08-14 10:00:08] 🔄 Migrating from SQLite: /app/data/chatollama.sqlite
[2025-08-14 10:00:15] ✅ Migration completed successfully
[2025-08-14 10:00:16] 📁 SQLite database backed up and marked as migrated
[2025-08-14 10:00:17] 🎉 Initialization complete, starting application...
```

### Health Checks
Monitor container health:
```bash
docker ps  # Check container status
docker logs <container-name>  # View migration logs
docker exec <container-name> pnpm tsx scripts/validate-postgres-data.ts  # Validate data
```

## ⚠️ Troubleshooting

### Migration Timeout
If migration takes too long:
```yaml
environment:
  - MIGRATION_TIMEOUT=600  # Increase to 10 minutes
```

### PostgreSQL Connection Issues
```yaml
environment:
  - DATABASE_URL=postgresql://user:pass@postgres:5432/dbname
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U user -d dbname"]
```

### Disable Migration Temporarily
```yaml
environment:
  - SKIP_MIGRATION=true
```

### Manual Migration
```bash
docker exec -it <container> pnpm run migrate:sqlite-to-postgres -- --help
```

## 🎯 Best Practices

1. **Use proper volume mounts**: Mount SQLite location to `/app/data`
2. **Enable health checks**: Use PostgreSQL health checks for proper startup order
3. **Monitor logs**: Watch container startup logs for migration status
4. **Test with dry-run**: Use `--dry-run` flag to validate before actual migration
5. **Backup important data**: Though migration creates backups, keep your own
6. **Set appropriate timeouts**: Adjust `MIGRATION_TIMEOUT` for large databases

## 🔮 Future Improvements

- Progress indicators for large migrations
- Migration rollback capabilities  
- Selective table migration options
- Migration scheduling for specific times
- Enhanced logging and monitoring integration