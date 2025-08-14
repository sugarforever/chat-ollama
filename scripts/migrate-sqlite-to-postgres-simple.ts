#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import fs from 'fs/promises'
import { execSync } from 'child_process'

interface MigrationOptions {
  sqliteUrl: string
  postgresUrl: string
  skipBackup?: boolean
  dryRun?: boolean
}

interface SQLiteRow {
  [key: string]: any
}

class SQLiteToPostgresMigrator {
  private postgresClient: PrismaClient | null = null

  /**
   * Parse SQLite date values which can be either numeric timestamps or ISO date strings
   */
  private parseDate(value: any): Date | null {
    if (!value || value === '' || value === '0') return null
    
    // Try parsing as numeric timestamp first
    const numValue = Number(value)
    if (!isNaN(numValue) && numValue > 0) {
      // Handle both seconds and milliseconds timestamps
      const timestamp = numValue > 10000000000 ? numValue : numValue * 1000
      return new Date(timestamp)
    }
    
    // Try parsing as ISO date string
    const dateValue = new Date(value)
    if (!isNaN(dateValue.getTime())) {
      return dateValue
    }
    
    console.warn(`⚠️  Could not parse date value: ${value}`)
    return null
  }

  async migrateSqliteToPostgres(options: MigrationOptions) {
    const { sqliteUrl, postgresUrl, skipBackup = false, dryRun = false } = options

    console.log(`🚀 Starting SQLite to PostgreSQL migration${dryRun ? ' (DRY RUN)' : ''}...`)
    
    // Check if SQLite database exists
    const sqliteDbPath = sqliteUrl.replace('file:', '')
    try {
      await fs.access(sqliteDbPath)
    } catch {
      console.log('❌ SQLite database not found at:', sqliteDbPath)
      console.log('✅ No migration needed - starting fresh with PostgreSQL')
      return
    }

    // Create backup if not skipped
    if (!skipBackup && !dryRun) {
      console.log('📦 Creating backup of SQLite database...')
      const backupPath = `${sqliteDbPath}.backup.${Date.now()}`
      await fs.copyFile(sqliteDbPath, backupPath)
      console.log('✅ Backup created at:', backupPath)
    }

    try {
      // Initialize PostgreSQL connection
      await this.initializePostgresConnection(postgresUrl)

      // Check target database status (informational only)
      await this.checkTargetDatabase()

      // Perform migration
      await this.performMigration(sqliteDbPath, dryRun)

      console.log(`🎉 Migration ${dryRun ? 'validation' : 'completed'} successfully!`)
      if (!dryRun) {
        console.log('💡 Your SQLite database has been backed up and data migrated to PostgreSQL')
        console.log('🔧 You can now update your Docker Compose files to use PostgreSQL')
      }
      
    } catch (error) {
      console.error(`❌ Migration ${dryRun ? 'validation' : ''} failed:`, error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  private async initializePostgresConnection(postgresUrl: string) {
    console.log('🔌 Connecting to PostgreSQL...')
    
    this.postgresClient = new PrismaClient({
      datasources: { postgres: { url: postgresUrl } }
    })
    await this.postgresClient.$connect()
    
    console.log('✅ PostgreSQL connection established')
  }

  private async checkTargetDatabase() {
    if (!this.postgresClient) throw new Error('PostgreSQL client not initialized')

    console.log('🔍 Checking target PostgreSQL database...')
    
    try {
      const userCount = await this.postgresClient.user.count()
      const kbCount = await this.postgresClient.knowledgeBase.count()
      const instructionCount = await this.postgresClient.instruction.count()
      const accountCount = await this.postgresClient.account.count()
      
      if (userCount > 0 || kbCount > 0 || instructionCount > 0 || accountCount > 0) {
        console.log('ℹ️  Target database contains existing data:')
        console.log(`   - Users: ${userCount}`)
        console.log(`   - Knowledge Bases: ${kbCount}`)
        console.log(`   - Instructions: ${instructionCount}`)
        console.log(`   - Accounts: ${accountCount}`)
        console.log('📝 Migration will use upsert operations to safely merge data')
      } else {
        console.log('✅ Target database is empty, ready for migration')
      }
    } catch (error: any) {
      console.log('⚠️  Could not check target database state, proceeding with migration...')
    }
  }

  private async performMigration(sqliteDbPath: string, dryRun: boolean) {
    console.log('📊 Starting data migration...')

    if (!dryRun) {
      await this.postgresClient!.$transaction(async (tx) => {
        await this.migrateAllTables(tx, sqliteDbPath, dryRun)
      }, {
        timeout: 300000 // 5 minutes timeout
      })
    } else {
      await this.migrateAllTables(this.postgresClient!, sqliteDbPath, dryRun)
    }
  }

  private async migrateAllTables(tx: any, sqliteDbPath: string, dryRun: boolean) {
    // 1. Migrate Users
    await this.migrateTable('User', 'users', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} users to migrate`)
      if (dryRun) return

      let migrated = 0
      let skipped = 0
      
      for (const user of data) {
        try {
          await tx.user.upsert({
            where: { id: user.id },
            update: {
              // Update fields that might have changed
              email: user.email,
              first_name: user.first_name,
              last_name: user.last_name,
              role: user.role ?? 0,
              email_verified: Boolean(user.email_verified),
              is_active: Boolean(user.is_active),
              last_login: user.last_login ? this.parseDate(user.last_login) : null,
              deleted_at: user.deleted_at ? this.parseDate(user.deleted_at) : null,
              access_token: user.access_token,
              updated_at: user.updated_at ? this.parseDate(user.updated_at) : null,
              provider: user.provider,
              provider_id: user.provider_id,
              avatar: user.avatar,
            },
            create: {
              id: user.id,
              name: user.name,
              email: user.email,
              password: user.password,
              first_name: user.first_name,
              last_name: user.last_name,
              role: user.role ?? 0,
              email_verified: Boolean(user.email_verified),
              is_active: Boolean(user.is_active),
              last_login: user.last_login ? this.parseDate(user.last_login) : null,
              created_at: user.created_at ? this.parseDate(user.created_at) : new Date(),
              deleted_at: user.deleted_at ? this.parseDate(user.deleted_at) : null,
              access_token: user.access_token,
              updated_at: user.updated_at ? new Date(Number(user.updated_at)) : null,
              provider: user.provider,
              provider_id: user.provider_id,
              avatar: user.avatar,
            }
          })
          migrated++
        } catch (error: any) {
          if (error.code === 'P2002') { // Unique constraint violation
            console.log(`⚠️  User with name "${user.name}" already exists, skipping`)
            skipped++
          } else {
            console.error(`❌ Error migrating user ${user.id}:`, error.message)
            throw error
          }
        }
      }
      
      console.log(`📊 Users migration result: ${migrated} migrated, ${skipped} skipped`)
    })

    // 2. Migrate Knowledge Bases
    await this.migrateTable('KnowledgeBase', 'knowledge bases', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} knowledge bases to migrate`)
      if (dryRun) return

      for (const kb of data) {
        await tx.knowledgeBase.upsert({
          where: { id: kb.id },
          update: {},
          create: {
            id: kb.id,
            name: kb.name,
            embedding: kb.embedding,
            description: kb.description,
            created: kb.created ? new Date(kb.created) : null,
            updated: kb.updated ? new Date(kb.updated) : null,
            parentChunkSize: kb.parentChunkSize,
            parentChunkOverlap: kb.parentChunkOverlap,
            childChunkSize: kb.childChunkSize,
            childChunkOverlap: kb.childChunkOverlap,
            parentK: kb.parentK,
            childK: kb.childK,
            is_public: Boolean(kb.is_public ?? true),
            user_id: kb.user_id,
          }
        })
      }
    })

    // 3. Migrate Knowledge Base Files
    await this.migrateTable('KnowledgeBaseFile', 'knowledge base files', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} knowledge base files to migrate`)
      if (dryRun) return

      for (const file of data) {
        await tx.knowledgeBaseFile.upsert({
          where: { id: file.id },
          update: {},
          create: {
            id: file.id,
            url: file.url,
            knowledgeBaseId: file.knowledgeBaseId,
          }
        })
      }
    })

    // 4. Migrate Instructions
    await this.migrateTable('Instruction', 'instructions', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} instructions to migrate`)
      if (dryRun) return

      let migrated = 0
      let skipped = 0
      
      for (const instruction of data) {
        try {
          await tx.instruction.upsert({
            where: { id: instruction.id },
            update: {
              instruction: instruction.instruction,
              user_id: instruction.user_id,
              is_public: Boolean(instruction.is_public),
            },
            create: {
              id: instruction.id,
              name: instruction.name,
              instruction: instruction.instruction,
              user_id: instruction.user_id,
              is_public: Boolean(instruction.is_public),
            }
          })
          migrated++
        } catch (error: any) {
          if (error.code === 'P2002') { // Unique constraint violation
            console.log(`⚠️  Instruction with name "${instruction.name}" already exists, skipping`)
            skipped++
          } else {
            console.error(`❌ Error migrating instruction ${instruction.id}:`, error.message)
            throw error
          }
        }
      }
      
      console.log(`📊 Instructions migration result: ${migrated} migrated, ${skipped} skipped`)
    })

    // 5. Migrate MCP Servers (if they exist)
    await this.migrateTable('mcp_servers', 'MCP servers', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} MCP servers to migrate`)
      if (dryRun) return

      for (const server of data) {
        await tx.mcpServer.upsert({
          where: { id: server.id },
          update: {},
          create: {
            id: server.id,
            name: server.name,
            transport: server.transport,
            command: server.command,
            args: server.args,
            url: server.url,
            createdAt: server.created_at ? new Date(server.created_at) : new Date(),
            updatedAt: server.updated_at ? new Date(server.updated_at) : new Date(),
            enabled: Boolean(server.enabled ?? true),
          }
        })
      }
    })

    // 6. Migrate MCP Server Environment Variables
    await this.migrateTable('mcp_server_env_vars', 'MCP server env vars', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} MCP server env vars to migrate`)
      if (dryRun) return

      for (const envVar of data) {
        await tx.mcpServerEnvVar.upsert({
          where: { id: envVar.id },
          update: {},
          create: {
            id: envVar.id,
            mcpServerId: envVar.mcp_server_id,
            key: envVar.key,
            value: envVar.value,
            createdAt: envVar.created_at ? new Date(envVar.created_at) : new Date(),
          }
        })
      }
    })

    // 7. Migrate NextAuth data
    await this.migrateAuthTables(tx, sqliteDbPath, dryRun)

    // 8. Reset sequences (only if not dry run)
    if (!dryRun) {
      await this.resetSequences(tx)
    }
  }

  private async migrateTable(tableName: string, description: string, sqliteDbPath: string, migrationFn: (data: SQLiteRow[]) => Promise<void>) {
    try {
      console.log(`🔄 Migrating ${description}...`)
      
      // Query SQLite using CLI
      const result = execSync(`sqlite3 "${sqliteDbPath}" "SELECT * FROM \\"${tableName}\\" WHERE 1;" | cat`, { 
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }).trim()
      
      if (!result) {
        console.log(`⚠️  No data found in ${tableName} table`)
        return
      }

      // Get column names
      const columnsResult = execSync(`sqlite3 "${sqliteDbPath}" "PRAGMA table_info(${tableName});" | cat`, { 
        encoding: 'utf8' 
      }).trim()
      
      if (!columnsResult) {
        console.log(`⚠️  Table ${tableName} not found in SQLite, skipping...`)
        return
      }

      // Parse columns (format: index|name|type|notnull|default|pk)
      const columns = columnsResult.split('\n').map(line => {
        const parts = line.split('|')
        return parts[1] // column name
      })

      // Parse data rows (SQLite CLI outputs pipe-separated values)
      const rows = result.split('\n').map(line => {
        const values = line.split('|')
        const row: SQLiteRow = {}
        columns.forEach((col, index) => {
          let value = values[index]
          if (value === '' || value === undefined) value = null
          // Try to parse numbers for specific numeric columns
          if (value !== null && ['id', 'role', 'user_id', 'userId', 'knowledgeBaseId', 'mcp_server_id', 'expires_at'].includes(col) && !isNaN(Number(value))) {
            row[col] = Number(value)
          } else if (value !== null && ['email_verified', 'is_active', 'is_public', 'enabled'].includes(col)) {
            // Parse boolean values
            row[col] = value === '1' || value === 'true'
          } else {
            row[col] = value
          }
        })
        return row
      }).filter(row => Object.keys(row).length > 0)

      console.log(`📋 Debug: Parsed ${rows.length} rows from ${tableName}`)
      if (rows.length > 0) {
        console.log(`📋 Debug: Sample row columns: ${Object.keys(rows[0]).join(', ')}`)
      }

      await migrationFn(rows)
      console.log(`✅ ${description} migrated successfully`)
    } catch (error: any) {
      if (error.message?.includes('no such table') || error.status === 1) {
        console.log(`⚠️  Table ${tableName} not found in SQLite, skipping...`)
      } else {
        console.error(`❌ Failed to migrate ${description}:`, error)
        throw error
      }
    }
  }

  private async migrateAuthTables(tx: any, sqliteDbPath: string, dryRun: boolean) {
    // Accounts
    await this.migrateTable('Account', 'authentication accounts', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} accounts to migrate`)
      if (dryRun) return

      for (const account of data) {
        await tx.account.upsert({
          where: { id: account.id },
          update: {},
          create: account
        })
      }
    })

    // Sessions
    await this.migrateTable('Session', 'authentication sessions', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} sessions to migrate`)
      if (dryRun) return

      for (const session of data) {
        await tx.session.upsert({
          where: { id: session.id },
          update: {},
          create: {
            ...session,
            expires: new Date(session.expires)
          }
        })
      }
    })

    // Verification Tokens
    await this.migrateTable('VerificationToken', 'verification tokens', sqliteDbPath, async (data) => {
      console.log(`Found ${data.length} verification tokens to migrate`)
      if (dryRun) return

      for (const token of data) {
        await tx.verificationToken.upsert({
          where: { 
            identifier_token: {
              identifier: token.identifier,
              token: token.token
            }
          },
          update: {},
          create: {
            ...token,
            expires: new Date(token.expires)
          }
        })
      }
    })
  }

  private async resetSequences(tx: any) {
    console.log('🔢 Resetting PostgreSQL sequences...')
    
    try {
      const sequences = [
        { table: 'user', sequence: 'User_id_seq' },
        { table: 'knowledgeBase', sequence: 'KnowledgeBase_id_seq' },
        { table: 'knowledgeBaseFile', sequence: 'KnowledgeBaseFile_id_seq' },
        { table: 'instruction', sequence: 'Instruction_id_seq' },
        { table: 'mcpServer', sequence: 'mcp_servers_id_seq' },
        { table: 'mcpServerEnvVar', sequence: 'mcp_server_env_vars_id_seq' }
      ]

      for (const { table, sequence } of sequences) {
        try {
          const result = await tx[table].aggregate({ _max: { id: true } })
          if (result._max.id) {
            await tx.$executeRawUnsafe(`SELECT setval('public."${sequence}"', ${result._max.id})`)
            console.log(`✅ Reset ${sequence} to ${result._max.id}`)
          }
        } catch (error) {
          console.log(`⚠️  Could not reset sequence ${sequence}, might not exist`)
        }
      }
    } catch (error) {
      console.error('⚠️  Error resetting sequences:', error)
    }
  }

  private async cleanup() {
    console.log('🧹 Cleaning up connections...')
    
    if (this.postgresClient) {
      await this.postgresClient.$disconnect()
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run migrate:sqlite-to-postgres [options]

Options:
  --sqlite-url <url>     SQLite database URL (default: file:./chatollama.sqlite)
  --postgres-url <url>   PostgreSQL database URL (default: from DATABASE_URL env)
  --skip-backup         Skip creating backup of SQLite database
  --dry-run             Validate migration without making changes
  --help, -h            Show this help message

Examples:
  pnpm run migrate:sqlite-to-postgres
  pnpm run migrate:sqlite-to-postgres -- --dry-run
  pnpm run migrate:sqlite-to-postgres -- --sqlite-url file:./old-database.sqlite
  pnpm run migrate:sqlite-to-postgres -- --postgres-url postgresql://user:pass@localhost:5432/chatollama
    `)
    return
  }

  const sqliteUrlIndex = args.indexOf('--sqlite-url')
  const postgresUrlIndex = args.indexOf('--postgres-url')
  const skipBackup = args.includes('--skip-backup')
  const dryRun = args.includes('--dry-run')

  const sqliteUrl = sqliteUrlIndex !== -1 && args[sqliteUrlIndex + 1] 
    ? args[sqliteUrlIndex + 1] 
    : 'file:./chatollama.sqlite'

  const postgresUrl = postgresUrlIndex !== -1 && args[postgresUrlIndex + 1] 
    ? args[postgresUrlIndex + 1] 
    : process.env.DATABASE_URL

  if (!postgresUrl) {
    console.error('❌ PostgreSQL URL not provided. Set DATABASE_URL environment variable or use --postgres-url')
    process.exit(1)
  }

  try {
    const migrator = new SQLiteToPostgresMigrator()
    await migrator.migrateSqliteToPostgres({
      sqliteUrl,
      postgresUrl,
      skipBackup,
      dryRun
    })
  } catch (error) {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { SQLiteToPostgresMigrator }