#!/usr/bin/env tsx

import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

interface LegacyMcpServerConfig {
    transport: string
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
}

interface LegacyMcpConfig {
    servers: Record<string, LegacyMcpServerConfig>
}

async function migrateMcpServers() {
    const prisma = new PrismaClient()

    try {
        console.log('Starting MCP servers migration...')

        // Check if there are already MCP servers in the database
        const existingServers = await prisma.mcpServer.count()
        if (existingServers > 0) {
            console.log(`Found ${existingServers} existing servers in database. Skipping migration.`)
            return
        }

        // Load the MCP servers from the .mcp-servers.json file
        let mcpConfigPath = path.join(process.cwd(), '.mcp-servers.json')
        if (process.env.MCP_SERVERS_CONFIG_PATH !== undefined) {
            mcpConfigPath = process.env.MCP_SERVERS_CONFIG_PATH
        }

        if (!fs.existsSync(mcpConfigPath)) {
            console.log('No .mcp-servers.json file found. Nothing to migrate.')
            return
        }

        console.log(`Loading MCP servers from ${mcpConfigPath}`)

        const configContent = fs.readFileSync(mcpConfigPath, 'utf-8')
        const config: LegacyMcpConfig = JSON.parse(configContent)

        if (!config.servers || Object.keys(config.servers).length === 0) {
            console.log('No servers found in config file.')
            return
        }

        console.log(`Found ${Object.keys(config.servers).length} servers to migrate`)

        // Migrate each server
        for (const [serverName, serverConfig] of Object.entries(config.servers)) {
            try {
                console.log(`Migrating server: ${serverName}`)

                // Create the server record
                const server = await prisma.mcpServer.create({
                    data: {
                        name: serverName,
                        transport: serverConfig.transport,
                        command: serverConfig.command || null,
                        args: serverConfig.args ? serverConfig.args.join(' ') : null,
                        url: serverConfig.url || null,
                        enabled: true
                    }
                })

                // Create environment variables if any
                if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
                    const envVars = Object.entries(serverConfig.env).map(([key, value]) => ({
                        mcpServerId: server.id,
                        key,
                        value
                    }))

                    await prisma.mcpServerEnvVar.createMany({
                        data: envVars
                    })

                    console.log(`  - Created ${envVars.length} environment variables`)
                }

                console.log(`  ✓ Successfully migrated server: ${serverName}`)
            } catch (error) {
                console.error(`  ✗ Failed to migrate server ${serverName}:`, error)
            }
        }

        console.log('\nMigration completed!')

        // Create a backup of the original file
        const backupPath = `${mcpConfigPath}.backup.${Date.now()}`
        fs.copyFileSync(mcpConfigPath, backupPath)
        console.log(`Original file backed up to: ${backupPath}`)

    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Run the migration if this script is executed directly
if (require.main === module) {
    migrateMcpServers()
        .then(() => {
            console.log('Migration script completed.')
            process.exit(0)
        })
        .catch((error) => {
            console.error('Migration script failed:', error)
            process.exit(1)
        })
}

export { migrateMcpServers }
