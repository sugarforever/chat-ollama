#!/bin/sh

# Set script to exit on any error
set -e

echo "🚀 Starting Chat-Ollama container initialization..."

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if PostgreSQL is ready
wait_for_postgres() {
    if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgresql://"; then
        log "🔍 Waiting for PostgreSQL to be ready..."
        
        # Extract connection details from DATABASE_URL for pg_isready check
        # This is a simple approach - in production you might want more robust parsing
        
        # Wait up to 30 seconds for PostgreSQL
        timeout=30
        while [ $timeout -gt 0 ]; do
            # Try to connect using pg_isready (same as Docker health check)
            if pg_isready -h postgres -p 5432 -U chatollama -d chatollama >/dev/null 2>&1; then
                log "✅ PostgreSQL is ready"
                return 0
            fi
            log "⏳ Waiting for PostgreSQL... (${timeout}s remaining)"
            sleep 2
            timeout=$((timeout - 2))
        done
        
        log "❌ PostgreSQL not ready after 30s, proceeding anyway"
    fi
}

# Function to perform safe migration
perform_migration() {
    # Check if migration is disabled
    if [ "$SKIP_MIGRATION" = "true" ]; then
        log "⏭️  Migration skipped (SKIP_MIGRATION=true)"
        return 0
    fi
    
    log "🔍 Checking for SQLite to PostgreSQL migration..."
    
    # Check if we need to migrate from SQLite to PostgreSQL
    if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgresql://"; then
        # Check if SQLite database exists
        if [ -f "/app/data/chatollama.sqlite" ] || [ -f "/app/sqlite/chatollama.sqlite" ] || [ -f "/app/chatollama.sqlite" ]; then
            log "📦 SQLite database found - initiating migration to PostgreSQL"
            
            # Determine SQLite path
            SQLITE_PATH=""
            if [ -f "/app/data/chatollama.sqlite" ]; then
                SQLITE_PATH="/app/data/chatollama.sqlite"
            elif [ -f "/app/sqlite/chatollama.sqlite" ]; then
                SQLITE_PATH="/app/sqlite/chatollama.sqlite"
            elif [ -f "/app/chatollama.sqlite" ]; then
                SQLITE_PATH="/app/chatollama.sqlite"
            fi
            
            log "🔄 Migrating from SQLite: $SQLITE_PATH"
            
            # Set migration timeout (default 300 seconds)
            MIGRATION_TIMEOUT=${MIGRATION_TIMEOUT:-300}
            
            # Run migration with timeout and error handling
            log "⏱️  Running migration (timeout: ${MIGRATION_TIMEOUT}s)..."
            if timeout $MIGRATION_TIMEOUT pnpm run migrate:sqlite-to-postgres --sqlite-url "file:$SQLITE_PATH" --skip-backup; then
                log "✅ Migration completed successfully"
                
                # Optionally rename SQLite file to mark it as migrated
                if [ -f "$SQLITE_PATH" ]; then
                    mv "$SQLITE_PATH" "${SQLITE_PATH}.migrated.$(date +%Y%m%d-%H%M%S)"
                    log "📁 SQLite database backed up and marked as migrated"
                fi
            else
                exit_code=$?
                if [ $exit_code -eq 124 ]; then
                    log "⏰ Migration timed out after ${MIGRATION_TIMEOUT}s"
                else
                    log "⚠️  Migration encountered issues (exit code: $exit_code)"
                fi
                log "🚀 Continuing startup - you can manually run migration later"
                log "💡 Manual command: pnpm run migrate:sqlite-to-postgres"
            fi
        else
            log "ℹ️  No SQLite database found, skipping migration"
        fi
    else
        log "ℹ️  Using SQLite database, no migration needed"
    fi
}

# Function to ensure database schema is ready
setup_database() {
    log "🗄️  Setting up database schema..."
    
    # Generate Prisma client
    pnpm run prisma-generate
    
    # Deploy database migrations
    if pnpm run prisma-deploy; then
        log "✅ Database schema is up-to-date"
    else
        log "❌ Database schema setup failed"
        exit 1
    fi
}

# Main execution
main() {
    log "🏁 Starting initialization sequence..."
    
    # Wait for PostgreSQL if using it
    wait_for_postgres
    
    # Setup database schema first
    setup_database
    
    # Perform migration if needed
    perform_migration
    
    log "🎉 Initialization complete, starting application..."
    
    # Start the application
    if [ -f /app/.env ]; then
        node --env-file=/app/.env .output/server/index.mjs
    else
        node .output/server/index.mjs
    fi
}

# Handle signals gracefully
trap 'log "🛑 Received termination signal, shutting down..."; exit 0' TERM INT

# Run main function
main
