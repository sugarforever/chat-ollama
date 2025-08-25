interface AuthUser {
    id: number
    name: string
    email: string | null
    role: string // 'user', 'admin', 'superadmin'
}

export const useUserRole = () => {
    const user = useState<AuthUser | null>('auth.user', () => null)

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
     * Fetch current user information
     */
    const fetchUser = async () => {
        try {
            const response = await $fetch<AuthUser>('/api/auth/user')
            user.value = response
            return response
        } catch (error) {
            user.value = null
            return null
        }
    }

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
        fetchUser,
        logout,
        requireAdmin,
        requireSuperAdmin
    }
}
