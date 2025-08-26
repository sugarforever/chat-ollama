#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'

enum Role {
    USER = 0,
    ADMIN = 1,
    SUPERADMIN = 2
}

const prisma = new PrismaClient()

async function promoteUserToSuperAdmin(identifier: string) {
    try {
        console.log(`🔍 Looking for user: ${identifier}`)
        
        // Try to find user by name or email
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { name: identifier },
                    { email: identifier }
                ]
            }
        })

        if (!user) {
            console.log(`❌ User not found: ${identifier}`)
            console.log('💡 Make sure the user exists and try using their exact username or email')
            return false
        }

        if (user.role === Role.SUPERADMIN) {
            console.log(`✅ User "${user.name}" (${user.email}) is already a Super Admin`)
            return true
        }

        // Update user role to Super Admin
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { role: Role.SUPERADMIN }
        })

        console.log(`🎉 Successfully promoted user to Super Admin:`)
        console.log(`   Name: ${updatedUser.name}`)
        console.log(`   Email: ${updatedUser.email}`)
        console.log(`   Role: ${updatedUser.role} (Super Admin)`)
        
        return true
    } catch (error) {
        console.error('❌ Error promoting user:', error)
        return false
    }
}

async function listSuperAdmins() {
    try {
        const superAdmins = await prisma.user.findMany({
            where: { role: Role.SUPERADMIN },
            select: {
                id: true,
                name: true,
                email: true,
                created_at: true
            }
        })

        if (superAdmins.length === 0) {
            console.log('📋 No Super Admins found')
        } else {
            console.log(`📋 Current Super Admins (${superAdmins.length}):`)
            superAdmins.forEach(admin => {
                console.log(`   • ${admin.name} (${admin.email}) - Created: ${admin.created_at?.toLocaleDateString()}`)
            })
        }
    } catch (error) {
        console.error('❌ Error listing Super Admins:', error)
    }
}

async function showUsage() {
    console.log(`
🔧 Super Admin Promotion Tool

Usage:
  npm run promote-super-admin <username_or_email>
  npm run promote-super-admin --list
  npm run promote-super-admin --help

Examples:
  npm run promote-super-admin john_doe
  npm run promote-super-admin john@example.com
  npm run promote-super-admin --list

Options:
  --list    List all current Super Admins
  --help    Show this help message
`)
}

async function main() {
    const args = process.argv.slice(2)
    
    if (args.length === 0 || args.includes('--help')) {
        await showUsage()
        return
    }

    if (args.includes('--list')) {
        await listSuperAdmins()
        return
    }

    const identifier = args[0]
    if (!identifier) {
        console.log('❌ Please provide a username or email')
        await showUsage()
        return
    }

    console.log('🚀 Starting Super Admin promotion process...')
    
    const success = await promoteUserToSuperAdmin(identifier)
    
    if (success) {
        console.log('\n🎯 Promotion completed successfully!')
        console.log('💡 The user now has Super Admin privileges')
    } else {
        console.log('\n❌ Promotion failed')
        process.exit(1)
    }
}

// Handle cleanup on exit
process.on('beforeExit', async () => {
    await prisma.$disconnect()
})

process.on('SIGINT', async () => {
    await prisma.$disconnect()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    await prisma.$disconnect()
    process.exit(0)
})

// Run the script
main().catch(async (error) => {
    console.error('💥 Unexpected error:', error)
    await prisma.$disconnect()
    process.exit(1)
})