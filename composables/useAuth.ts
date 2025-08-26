interface AuthUser {
    id: number
    name: string
    email: string | null
    role: string // 'user', 'admin', 'superadmin'
}

export const useUserRole = () => {
    const user = useState<AuthUser | null>('auth.user', () => null)
    const aclEnabled = useState<boolean>('auth.aclEnabled', () => false)

    /**
     * Check if current user has admin privileges
     */
    const isAdmin = computed(() => {
        if (!user.value) return false
        return user.value.role === 'admin' || user.value.role === 'superadmin'
    })

    /**
     * Check if current user has superadmin privileges
     */
    const isSuperAdmin = computed(() => {
        if (!user.value) return false
        return user.value.role === 'superadmin'
    })

    /**
     * Check if current user is authenticated
     */
    const isAuthenticated = computed(() => {
        return user.value !== null
    })

    /**
     * Get current user role
     */
    const userRole = computed(() => {
        return user.value?.role || 'user'
    })

    /**
     * Fetch current user information and ACL status
     */
    const fetchUser = async () => {
        try {
            // Always fetch ACL status first
            const aclResponse = await $fetch<{ aclEnabled: boolean }>('/api/auth/acl-status')
            aclEnabled.value = aclResponse.aclEnabled

            // Try to fetch user info, but don't fail if user is not authenticated
            try {
                const userResponse = await $fetch<AuthUser>('/api/auth/user')
                user.value = userResponse
                return userResponse
            } catch (userError) {
                // User not authenticated - this is OK when ACL is disabled
                user.value = null
                return null
            }
        } catch (error) {
            // If we can't fetch ACL status, assume it's enabled for security
            user.value = null
            aclEnabled.value = true
            return null
        }
    }

    /**
     * Check if ACL (Access Control Lists) are enabled
     * This determines whether admin checks are enforced
     */
    const isAclEnabled = computed(() => {
        return aclEnabled.value
    })

    /**
     * Check if current user can manage MCP servers
     * This combines ACL status with user role
     */
    const canManageMcpServers = computed(() => {
        // If user is not authenticated, they can't manage anything when ACL is enabled
        if (aclEnabled.value && !isAuthenticated.value) {
            return false
        }

        // If ACL is disabled, all users (even non-authenticated) can manage MCP servers
        if (!aclEnabled.value) {
            return true
        }

        // If ACL is enabled, require admin privileges
        return isAdmin.value
    })

    /**
     * Logout current user
     */
    const logout = async () => {
        try {
            await $fetch('/api/auth/logout', { method: 'POST' })
        } finally {
            user.value = null
            await navigateTo('/login')
        }
    }

    /**
     * Require admin access - throws error if not admin
     */
    const requireAdmin = () => {
        if (!isAdmin.value) {
            throw createError({
                statusCode: 403,
                statusMessage: 'Admin access required'
            })
        }
    }

    /**
     * Require superadmin access - throws error if not superadmin
     */
    const requireSuperAdmin = () => {
        if (!isSuperAdmin.value) {
            throw createError({
                statusCode: 403,
                statusMessage: 'Super admin access required'
            })
        }
    }

    return {
        user: readonly(user),
        isAdmin,
        isSuperAdmin,
        isAuthenticated,
        userRole,
        isAclEnabled,
        canManageMcpServers,
        fetchUser,
        logout,
        requireAdmin,
        requireSuperAdmin
    }
}
