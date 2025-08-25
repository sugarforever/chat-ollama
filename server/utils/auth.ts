import type { H3Event } from 'h3'
import jwt from 'jsonwebtoken'

export const SECRET = process.env.SECRET || 'changeit'
export const TOKEN_TYPE = 'Bearer'

export enum Role {
    USER = 0,
    ADMIN = 1,
    SUPERADMIN = 2
}

export interface AuthUser {
    id: number
    name: string
    email: string | null
    role: string // 'user', 'admin', 'superadmin'
}

/**
 * Extract token from Authorization header
 */
const extractToken = (authHeaderValue: string): string => {
    const [, token] = authHeaderValue.split(`${TOKEN_TYPE} `)
    return token
}

/**
 * Parse and verify authentication token from request
 */
export const parseAuthUser = (event: H3Event): AuthUser | null => {
    const authHeaderValue = getRequestHeader(event, 'Authorization')
    const cookieToken = getCookie(event, 'auth-token')

    // Try Authorization header first
    if (authHeaderValue != null) {
        const extractedToken = extractToken(authHeaderValue)
        try {
            return jwt.verify(extractedToken, SECRET) as AuthUser
        } catch (error) {
            console.log('Invalid token from Authorization header.')
        }
    }

    // Fall back to cookie token
    if (cookieToken) {
        try {
            return jwt.verify(cookieToken, SECRET) as AuthUser
        } catch (error) {
            console.log('Invalid token from cookie.')
        }
    }

    return null
}

/**
 * Require user to be authenticated and return user info
 */
export function requireAuth(event: H3Event): AuthUser {
    const user = parseAuthUser(event)

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Authentication required'
        })
    }

    // Store user in context for future use
    event.context.user = user

    return user
}

/**
 * Require user to be authenticated and have admin or superadmin role
 */
export function requireAdmin(event: H3Event): AuthUser {
    const user = requireAuth(event)

    if (user.role !== 'admin' && user.role !== 'superadmin') {
        throw createError({
            statusCode: 403,
            statusMessage: 'Admin access required'
        })
    }

    return user
}

/**
 * Require user to be authenticated and have superadmin role
 */
export function requireSuperAdmin(event: H3Event): AuthUser {
    const user = requireAuth(event)

    if (user.role !== 'superadmin') {
        throw createError({
            statusCode: 403,
            statusMessage: 'Super admin access required'
        })
    }

    return user
}

/**
 * Check if user has admin privileges (admin or superadmin)
 */
export function isAdmin(user: AuthUser | null): boolean {
    if (!user) return false
    return user.role === 'admin' || user.role === 'superadmin'
}

/**
 * Check if user has superadmin privileges
 */
export function isSuperAdmin(user: AuthUser | null): boolean {
    if (!user) return false
    return user.role === 'superadmin'
}

/**
 * Get user role as enum value
 */
export function getUserRoleEnum(roleString: string): Role {
    switch (roleString) {
        case 'admin':
            return Role.ADMIN
        case 'superadmin':
            return Role.SUPERADMIN
        default:
            return Role.USER
    }
}

/**
 * Convert role enum to string
 */
export function getRoleString(roleEnum: Role): string {
    switch (roleEnum) {
        case Role.ADMIN:
            return 'admin'
        case Role.SUPERADMIN:
            return 'superadmin'
        default:
            return 'user'
    }
}
