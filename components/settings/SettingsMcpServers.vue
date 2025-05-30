<script setup lang="ts">
import type { McpServerConfig, McpServerCreateInput, McpServerUpdateInput, TransportType } from '~/server/types/mcp'

const { t } = useI18n()
const toast = useToast()
const modal = useModal()

// State management
const servers = ref<McpServerConfig[]>([])
const loading = ref(false)
const showCreateForm = ref(false)
const editingServer = ref<McpServerConfig | null>(null)

// Form state
const createForm = reactive<McpServerCreateInput>({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    envVars: [],
    enabled: true
})

const editForm = reactive<McpServerUpdateInput>({})

// Transport options
const transportOptions = [
    { value: 'stdio', label: 'STDIO' },
    { value: 'sse', label: 'Server-Sent Events' },
    { value: 'streamable-http', label: 'Streamable HTTP' }
]

// Environment variables for forms
const createEnvVars = ref<Array<{ key: string; value: string }>>([])
const editEnvVars = ref<Array<{ key: string; value: string }>>([])

// Computed properties
const isStdioTransport = computed(() => createForm.transport === 'stdio')
const isUrlTransport = computed(() => createForm.transport === 'sse' || createForm.transport === 'streamable-http')
const editIsStdioTransport = computed(() => editForm.transport === 'stdio')
const editIsUrlTransport = computed(() => editForm.transport === 'sse' || editForm.transport === 'streamable-http')

// Validation
const validateCreateForm = () => {
    const errors: Array<{ path: string, message: string }> = []

    if (!createForm.name?.trim()) {
        errors.push({ path: 'name', message: t('global.required') })
    }

    if (!createForm.transport) {
        errors.push({ path: 'transport', message: t('global.required') })
    }

    if (isStdioTransport.value) {
        if (!createForm.command?.trim()) {
            errors.push({ path: 'command', message: 'Command is required for stdio transport' })
        }
        if (!createForm.args?.trim()) {
            errors.push({ path: 'args', message: 'Args are required for stdio transport' })
        }
    }

    if (isUrlTransport.value && !createForm.url?.trim()) {
        errors.push({ path: 'url', message: `URL is required for ${createForm.transport} transport` })
    }

    if (createForm.url) {
        try {
            new URL(createForm.url)
        } catch {
            errors.push({ path: 'url', message: t('global.invalidUrl') })
        }
    }

    return errors
}

// API calls
const fetchServers = async () => {
    loading.value = true
    try {
        const response = await $fetch<{ success: boolean; data: McpServerConfig[] }>('/api/mcp-servers')
        if (response.success) {
            servers.value = response.data
        }
    } catch (error) {
        console.error('Failed to fetch MCP servers:', error)
        toast.add({ title: 'Failed to fetch MCP servers', color: 'red' })
    } finally {
        loading.value = false
    }
}

const createServer = async () => {
    const errors = validateCreateForm()
    if (errors.length > 0) {
        errors.forEach(error => {
            toast.add({ title: error.message, color: 'red' })
        })
        return
    }

    try {
        createForm.envVars = createEnvVars.value.filter(env => env.key.trim() && env.value.trim())

        const response = await $fetch<{ success: boolean; data: McpServerConfig }>('/api/mcp-servers', {
            method: 'POST',
            body: createForm
        })

        if (response.success) {
            servers.value.push(response.data)
            resetCreateForm()
            showCreateForm.value = false
            toast.add({ title: 'MCP server created successfully', color: 'green' })
        }
    } catch (error: any) {
        console.error('Failed to create MCP server:', error)
        toast.add({ title: error.data?.message || 'Failed to create MCP server', color: 'red' })
    }
}

const updateServer = async (server: McpServerConfig) => {
    try {
        editForm.envVars = editEnvVars.value.filter(env => env.key.trim() && env.value.trim())

        const response = await $fetch<{ success: boolean; data: McpServerConfig }>(`/api/mcp-servers/${server.id}`, {
            method: 'PUT',
            body: editForm
        })

        if (response.success) {
            const index = servers.value.findIndex(s => s.id === server.id)
            if (index !== -1) {
                servers.value[index] = response.data
            }
            editingServer.value = null
            toast.add({ title: 'MCP server updated successfully', color: 'green' })
        }
    } catch (error: any) {
        console.error('Failed to update MCP server:', error)
        toast.add({ title: error.data?.message || 'Failed to update MCP server', color: 'red' })
    }
}

const deleteServer = async (server: McpServerConfig) => {
    try {
        await $fetch(`/api/mcp-servers/${server.id}`, {
            method: 'DELETE'
        })

        servers.value = servers.value.filter(s => s.id !== server.id)
        toast.add({ title: 'MCP server deleted successfully', color: 'green' })
    } catch (error: any) {
        console.error('Failed to delete MCP server:', error)
        toast.add({ title: error.data?.message || 'Failed to delete MCP server', color: 'red' })
    }
}

const toggleServer = async (server: McpServerConfig) => {
    try {
        const response = await $fetch<{ success: boolean; data: McpServerConfig }>(`/api/mcp-servers/${server.id}/toggle`, {
            method: 'POST'
        })

        if (response.success) {
            const index = servers.value.findIndex(s => s.id === server.id)
            if (index !== -1) {
                servers.value[index] = response.data
            }
            toast.add({
                title: `MCP server ${response.data.enabled ? 'enabled' : 'disabled'} successfully`,
                color: 'green'
            })
        }
    } catch (error: any) {
        console.error('Failed to toggle MCP server:', error)
        toast.add({ title: error.data?.message || 'Failed to toggle MCP server', color: 'red' })
    }
}

// Helper functions
const resetCreateForm = () => {
    Object.assign(createForm, {
        name: '',
        transport: 'stdio',
        command: '',
        args: '',
        url: '',
        envVars: [],
        enabled: true
    })
    createEnvVars.value = []
}

const startEditing = (server: McpServerConfig) => {
    editingServer.value = server
    Object.assign(editForm, {
        name: server.name,
        transport: server.transport,
        command: server.command || '',
        args: server.args || '',
        url: server.url || '',
        enabled: server.enabled
    })
    editEnvVars.value = server.env ? Object.entries(server.env).map(([key, value]) => ({ key, value })) : []
}

const cancelEditing = () => {
    editingServer.value = null
    Object.keys(editForm).forEach(key => delete editForm[key as keyof typeof editForm])
    editEnvVars.value = []
}

const addCreateEnvVar = () => {
    createEnvVars.value.push({ key: '', value: '' })
}

const removeCreateEnvVar = (index: number) => {
    createEnvVars.value.splice(index, 1)
}

const addEditEnvVar = () => {
    editEnvVars.value.push({ key: '', value: '' })
}

const removeEditEnvVar = (index: number) => {
    editEnvVars.value.splice(index, 1)
}

const confirmDelete = (server: McpServerConfig) => {
    modal.open({
        component: 'UModal',
        props: {
            title: 'Delete MCP Server',
            description: `Are you sure you want to delete the MCP server "${server.name}"?`,
            confirm: () => {
                deleteServer(server)
                modal.close()
            },
            cancel: () => modal.close()
        }
    })
}

// Lifecycle
onMounted(() => {
    fetchServers()
})
</script>

<template>
    <ClientOnly>
        <SettingsCard title="MCP Servers" subtitle="Manage Model Context Protocol servers for enhanced AI capabilities">
            <div class="space-y-6">
                <!-- Server List -->
                <div v-if="loading" class="text-center py-8">
                    <UIcon name="i-material-symbols-refresh" class="animate-spin w-6 h-6 mx-auto" />
                    <p class="mt-2 text-gray-500">Loading MCP servers...</p>
                </div>

                <div v-else-if="servers.length === 0" class="text-center py-8">
                    <UIcon name="i-material-symbols-storage" class="w-12 h-12 mx-auto text-gray-400 mb-3" />
                    <p class="text-gray-500 mb-4">No MCP servers configured</p>
                    <UButton @click="showCreateForm = true" color="primary">
                        <UIcon name="i-material-symbols-add" class="mr-2" />
                        Add Your First MCP Server
                    </UButton>
                </div>

                <div v-else class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold">Configured Servers ({{ servers.length }})</h3>
                        <UButton @click="showCreateForm = true" color="primary" size="sm">
                            <UIcon name="i-material-symbols-add" class="mr-2" />
                            Add Server
                        </UButton>
                    </div>

                    <div class="grid gap-4">
                        <UCard v-for="server in servers" :key="server.id" class="p-4">
                            <div v-if="editingServer?.id === server.id">
                                <!-- Edit Form -->
                                <UForm @submit="updateServer(server)" :state="editForm" class="space-y-4">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <UFormGroup label="Server Name" name="name">
                                            <UInput v-model="editForm.name" placeholder="Server name" />
                                        </UFormGroup>

                                        <UFormGroup label="Transport Type" name="transport">
                                            <USelect v-model="editForm.transport" :options="transportOptions" />
                                        </UFormGroup>
                                    </div>

                                    <div v-if="editIsStdioTransport" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <UFormGroup label="Command" name="command">
                                            <UInput v-model="editForm.command" placeholder="/path/to/command" />
                                        </UFormGroup>

                                        <UFormGroup label="Arguments" name="args">
                                            <UInput v-model="editForm.args" placeholder="arg1 arg2 --flag" />
                                        </UFormGroup>
                                    </div>

                                    <div v-if="editIsUrlTransport">
                                        <UFormGroup label="URL" name="url">
                                            <UInput v-model="editForm.url" placeholder="https://example.com/mcp" />
                                        </UFormGroup>
                                    </div>

                                    <!-- Environment Variables -->
                                    <div>
                                        <div class="flex items-center justify-between mb-2">
                                            <label class="text-sm font-medium">Environment Variables</label>
                                            <UButton @click="addEditEnvVar" size="xs" color="gray">
                                                <UIcon name="i-material-symbols-add" class="mr-1" />
                                                Add
                                            </UButton>
                                        </div>
                                        <div v-if="editEnvVars.length > 0" class="space-y-2">
                                            <div v-for="(envVar, index) in editEnvVars" :key="index" class="flex gap-2">
                                                <UInput v-model="envVar.key" placeholder="Key" class="flex-1" />
                                                <UInput v-model="envVar.value" placeholder="Value" class="flex-1" />
                                                <UButton @click="removeEditEnvVar(index)" size="xs" color="red" variant="ghost">
                                                    <UIcon name="i-material-symbols-delete" />
                                                </UButton>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-3">
                                        <UCheckbox v-model="editForm.enabled" />
                                        <label class="text-sm">Enable server</label>
                                    </div>

                                    <div class="flex gap-2">
                                        <UButton type="submit" color="primary" size="sm">
                                            <UIcon name="i-material-symbols-save" class="mr-2" />
                                            Save Changes
                                        </UButton>
                                        <UButton @click="cancelEditing" color="gray" size="sm">Cancel</UButton>
                                    </div>
                                </UForm>
                            </div>

                            <div v-else>
                                <!-- Server Display -->
                                <div class="flex items-start justify-between">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2 mb-2">
                                            <h4 class="font-medium text-lg">{{ server.name }}</h4>
                                            <UBadge :color="server.enabled ? 'green' : 'gray'" variant="soft">
                                                {{ server.enabled ? 'Enabled' : 'Disabled' }}
                                            </UBadge>
                                            <UBadge color="blue" variant="soft">{{ server.transport }}</UBadge>
                                        </div>

                                        <div class="space-y-1 text-sm text-gray-600">
                                            <div v-if="server.command">
                                                <span class="font-medium">Command:</span> {{ server.command }}
                                            </div>
                                            <div v-if="server.args">
                                                <span class="font-medium">Args:</span> {{ server.args }}
                                            </div>
                                            <div v-if="server.url">
                                                <span class="font-medium">URL:</span> {{ server.url }}
                                            </div>
                                            <div v-if="server.env && Object.keys(server.env).length > 0">
                                                <span class="font-medium">Environment:</span>
                                                {{ Object.keys(server.env).length }} variable(s)
                                            </div>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-1 ml-4">
                                        <UButton @click="toggleServer(server)"
                                                 :color="server.enabled ? 'orange' : 'green'"
                                                 size="xs"
                                                 variant="soft">
                                            <UIcon :name="server.enabled ? 'i-material-symbols-pause' : 'i-material-symbols-play-arrow'" class="mr-1" />
                                            {{ server.enabled ? 'Disable' : 'Enable' }}
                                        </UButton>

                                        <UButton @click="startEditing(server)" color="blue" size="xs" variant="soft">
                                            <UIcon name="i-material-symbols-edit" class="mr-1" />
                                            Edit
                                        </UButton>

                                        <UButton @click="confirmDelete(server)" color="red" size="xs" variant="soft">
                                            <UIcon name="i-material-symbols-delete" class="mr-1" />
                                            Delete
                                        </UButton>
                                    </div>
                                </div>
                            </div>
                        </UCard>
                    </div>
                </div>

                <!-- Create Form -->
                <div v-if="showCreateForm" class="border-t pt-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold">Add New MCP Server</h3>
                        <UButton @click="showCreateForm = false; resetCreateForm()" color="gray" size="sm" variant="ghost">
                            <UIcon name="i-material-symbols-close" />
                        </UButton>
                    </div>

                    <UForm @submit="createServer" :state="createForm" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <UFormGroup label="Server Name" name="name" required>
                                <UInput v-model="createForm.name" placeholder="My MCP Server" />
                            </UFormGroup>

                            <UFormGroup label="Transport Type" name="transport" required>
                                <USelect v-model="createForm.transport" :options="transportOptions" />
                            </UFormGroup>
                        </div>

                        <div v-if="isStdioTransport" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <UFormGroup label="Command" name="command" required>
                                <UInput v-model="createForm.command" placeholder="/usr/local/bin/uvx" />
                            </UFormGroup>

                            <UFormGroup label="Arguments" name="args" required>
                                <UInput v-model="createForm.args" placeholder="my-mcp-server@1.0.0" />
                            </UFormGroup>
                        </div>

                        <div v-if="isUrlTransport">
                            <UFormGroup label="URL" name="url" required>
                                <UInput v-model="createForm.url" placeholder="https://example.com/mcp" />
                            </UFormGroup>
                        </div>

                        <!-- Environment Variables -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <label class="text-sm font-medium">Environment Variables</label>
                                <UButton @click="addCreateEnvVar" size="xs" color="gray">
                                    <UIcon name="i-material-symbols-add" class="mr-1" />
                                    Add
                                </UButton>
                            </div>
                            <div v-if="createEnvVars.length > 0" class="space-y-2">
                                <div v-for="(envVar, index) in createEnvVars" :key="index" class="flex gap-2">
                                    <UInput v-model="envVar.key" placeholder="API_KEY" class="flex-1" />
                                    <UInput v-model="envVar.value" placeholder="your-api-key" type="password" class="flex-1" />
                                    <UButton @click="removeCreateEnvVar(index)" size="xs" color="red" variant="ghost">
                                        <UIcon name="i-material-symbols-delete" />
                                    </UButton>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <UCheckbox v-model="createForm.enabled" />
                            <label class="text-sm">Enable server immediately</label>
                        </div>

                        <div class="flex gap-2">
                            <UButton type="submit" color="primary">
                                <UIcon name="i-material-symbols-add" class="mr-2" />
                                Create Server
                            </UButton>
                            <UButton @click="showCreateForm = false; resetCreateForm()" color="gray">Cancel</UButton>
                        </div>
                    </UForm>
                </div>
            </div>
        </SettingsCard>
    </ClientOnly>
</template>
