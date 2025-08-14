# PostgreSQL Migration Guide

This guide helps you migrate from SQLite to PostgreSQL for your Chat-Ollama installation.

## Overview

Chat-Ollama has been updated to use PostgreSQL as the primary database provider. If you have existing data in SQLite, this migration process will help you preserve your data during the transition.

## Prerequisites

- Node.js and npm/pnpm installed
- Docker and Docker Compose
- Access to your existing SQLite database file

## Migration Steps

### 1. Backup Your Current Data

Before starting, ensure you have a backup of your current SQLite database:

```bash
cp chatollama.sqlite chatollama.sqlite.backup
```

### 2. Install Dependencies

Install the required migration dependencies:

```bash
npm install
# or
pnpm install
```

### 3. Run Migration (Dry Run First)

First, validate your migration without making changes:

```bash
pnpm run migrate:sqlite-to-postgres -- --dry-run
```

This will:
- Check if SQLite database exists
- Validate the data structure
- Show what would be migrated
- Verify PostgreSQL connection

### 4. Start PostgreSQL

Start the PostgreSQL service using Docker Compose:

```bash
# For standard setup
docker-compose up postgres -d

# For ARM systems
docker-compose -f docker-compose_arm.yaml up postgres -d

# For GPU systems  
docker-compose -f docker-compose_gpu.yaml up postgres -d
```

### 5. Run Database Migrations

Initialize the PostgreSQL database schema:

```bash
# Generate Prisma client for PostgreSQL
pnpm run prisma-generate

# Run database migrations
pnpm run prisma-migrate
```

### 6. Migrate Your Data

Run the actual data migration:

```bash
pnpm run migrate:sqlite-to-postgres
```

This will:
- Create a backup of your SQLite database
- Connect to both SQLite and PostgreSQL
- Migrate all tables and data
- Reset PostgreSQL sequences
- Verify the migration

### 7. Start All Services

Start all services with the new PostgreSQL setup:

```bash
# Standard setup
docker-compose up -d

# ARM systems
docker-compose -f docker-compose_arm.yaml up -d

# GPU systems
docker-compose -f docker-compose_gpu.yaml up -d
```

## Migration Script Options

The migration script supports several options:

```bash
# Basic migration
pnpm run migrate:sqlite-to-postgres

# Dry run (validation only)
pnpm run migrate:sqlite-to-postgres -- --dry-run

# Custom SQLite database path
pnpm run migrate:sqlite-to-postgres -- --sqlite-url file:./custom-database.sqlite

# Custom PostgreSQL URL
pnpm run migrate:sqlite-to-postgres -- --postgres-url postgresql://user:pass@localhost:5432/dbname

# Skip backup creation
pnpm run migrate:sqlite-to-postgres -- --skip-backup

# Help
pnpm run migrate:sqlite-to-postgres -- --help
```

## What Gets Migrated

The migration script transfers:

- **Users**: All user accounts and profiles
- **Knowledge Bases**: Document collections and metadata
- **Knowledge Base Files**: File references and URLs
- **Instructions**: Custom instruction sets
- **MCP Servers**: Model Context Protocol server configurations
- **Authentication Data**: OAuth accounts, sessions, and verification tokens

## Database Configuration

### Docker Compose Changes

The Docker Compose files have been updated with:

- PostgreSQL 16 Alpine service
- Persistent volume for PostgreSQL data
- Updated environment variables
- Service dependencies

### Environment Variables

Key environment variables in Docker Compose:

```yaml
environment:
  - DATABASE_URL=postgresql://chatollama:chatollama_password@postgres:5432/chatollama
  - CHROMADB_URL=http://chromadb:8000
  - REDIS_HOST=redis
```

## Troubleshooting

### Migration Fails

1. **Target database not empty**: Use a fresh PostgreSQL database or manually clear existing data
2. **Connection errors**: Verify PostgreSQL is running and accessible
3. **Schema mismatches**: Ensure you've run `npm run prisma-migrate` first

### Data Validation

After migration, verify your data:

```bash
# Check user count
docker-compose exec chatollama npx prisma studio

# Or use PostgreSQL directly
docker-compose exec postgres psql -U chatollama -d chatollama -c "SELECT COUNT(*) FROM \"User\";"
```

### Rollback (if needed)

If you need to rollback to SQLite:

1. Stop all services: `docker-compose down`
2. Restore your backup: `cp chatollama.sqlite.backup chatollama.sqlite`
3. Update `DATABASE_URL` to point back to SQLite
4. Restart services

## Performance Considerations

PostgreSQL offers several advantages over SQLite:

- Better concurrent access
- More advanced querying capabilities
- Better performance for complex operations
- Proper ACID compliance for multi-user scenarios

## Security Notes

The default Docker Compose configuration uses basic credentials. For production:

1. Change the PostgreSQL password
2. Use environment variables or secrets for credentials
3. Restrict database access to necessary services only
4. Consider using connection pooling for high-load scenarios

## Support

If you encounter issues during migration:

1. Check the migration logs for specific error messages
2. Verify all prerequisites are met
3. Try the dry-run option first to identify potential issues
4. Ensure your Docker setup has sufficient resources

The migration process is designed to be safe and reversible, with automatic backups created before any changes are made.