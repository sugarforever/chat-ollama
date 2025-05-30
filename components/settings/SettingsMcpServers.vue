<script setup lang="ts">
import type { McpServerConfig, McpServerCreateInput, McpServerUpdateInput, TransportType } from '~/server/types/mcp'

const { t } = useI18n()
const toast = useToast()
const confirm = useDialog('confirm')

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

// Computed for grouping servers by status
const enabledServers = computed(() => servers.value.filter(s => s.enabled))
const disabledServers = computed(() => servers.value.filter(s => !s.enabled))

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

const confirmDelete = async (server: McpServerConfig) => {
  try {
    await confirm(`Are you sure you want to delete the MCP server <b class="text-primary">"${server.name}"</b>?`, {
      title: 'Delete MCP Server',
      dangerouslyUseHTMLString: true,
    })
    await deleteServer(server)
  } catch (error) {
    // User cancelled or error occurred
    if (error !== 'canceled') {
      console.error('Failed to delete server:', error)
    }
  }
}

// Lifecycle
onMounted(() => {
  fetchServers()
})
</script>

<template>
  <ClientOnly>
    <SettingsCard title="MCP">
      <div class="space-y-4">
        <!-- Server List -->
        <div v-if="loading" class="text-center py-6">
          <UIcon name="i-material-symbols-refresh" class="animate-spin w-5 h-5 mx-auto" />
          <p class="mt-2 text-sm text-gray-500">Loading MCP servers...</p>
        </div>

        <div v-else-if="servers.length === 0" class="text-center py-6">
          <UIcon name="i-material-symbols-storage" class="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p class="text-sm text-gray-500 mb-3">No MCP servers configured</p>
          <UButton @click="showCreateForm = true" color="primary" size="sm">
            <UIcon name="i-material-symbols-add" class="mr-1" />
            Add Your First MCP Server
          </UButton>
        </div>

        <div v-else class="space-y-3">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold">Configured Servers</h3>
              <UBadge color="gray" variant="soft" size="sm">{{ servers.length }} total</UBadge>
              <UBadge v-if="enabledServers.length > 0" color="green" variant="soft" size="sm">
                {{ enabledServers.length }} enabled
              </UBadge>
              <UBadge v-if="disabledServers.length > 0" color="red" variant="soft" size="sm">
                {{ disabledServers.length }} disabled
              </UBadge>
            </div>
            <UButton @click="showCreateForm = true" color="primary" size="sm">
              <UIcon name="i-material-symbols-add" class="mr-1" />
              Add Server
            </UButton>
          </div>

          <!-- Enabled Servers -->
          <div v-if="enabledServers.length > 0" class="space-y-1">
            <div v-for="server in enabledServers" :key="server.id"
                 :class="[
                  'group relative rounded border-l-4 border-green-500 bg-green-50/50 hover:bg-green-50 dark:bg-green-950/20 dark:hover:bg-green-950/30 transition-colors',
                  editingServer?.id === server.id ? 'ring-2 ring-green-300 dark:ring-green-700' : ''
                ]">
              <div v-if="editingServer?.id === server.id" class="p-3">
                <!-- Edit Form -->
                <UForm @submit="updateServer(server)" :state="editForm" class="space-y-3">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <UFormGroup label="Server Name" name="name" size="sm">
                      <UInput v-model="editForm.name" placeholder="Server name" size="sm" />
                    </UFormGroup>

                    <UFormGroup label="Transport Type" name="transport" size="sm">
                      <USelect v-model="editForm.transport" :options="transportOptions" size="sm" />
                    </UFormGroup>
                  </div>

                  <div v-if="editIsStdioTransport" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <UFormGroup label="Command" name="command" size="sm">
                      <UInput v-model="editForm.command" placeholder="/path/to/command" size="sm" />
                    </UFormGroup>

                    <UFormGroup label="Arguments" name="args" size="sm">
                      <UInput v-model="editForm.args" placeholder="arg1 arg2 --flag" size="sm" />
                    </UFormGroup>
                  </div>

                  <div v-if="editIsUrlTransport">
                    <UFormGroup label="URL" name="url" size="sm">
                      <UInput v-model="editForm.url" placeholder="https://example.com/mcp" size="sm" />
                    </UFormGroup>
                  </div>

                  <!-- Environment Variables -->
                  <div v-if="editEnvVars.length > 0 || editingServer">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Environment Variables</label>
                      <UButton @click="addEditEnvVar" size="xs" color="gray" variant="ghost">
                        <UIcon name="i-material-symbols-add" class="text-xs" />
                      </UButton>
                    </div>
                    <div v-if="editEnvVars.length > 0" class="space-y-2">
                      <div v-for="(envVar, index) in editEnvVars" :key="index" class="flex gap-2">
                        <UInput v-model="envVar.key" placeholder="Key" class="flex-1" size="sm" />
                        <UInput v-model="envVar.value" placeholder="Value" class="flex-1" size="sm" />
                        <UButton @click="removeEditEnvVar(index)" size="xs" color="red" variant="ghost">
                          <UIcon name="i-material-symbols-delete" class="text-xs" />
                        </UButton>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <UCheckbox v-model="editForm.enabled" size="sm" />
                    <label class="text-xs">Enable server</label>
                  </div>

                  <div class="flex gap-2">
                    <UButton type="submit" color="primary" size="xs">
                      <UIcon name="i-material-symbols-save" class="mr-1 text-xs" />
                      Save
                    </UButton>
                    <UButton @click="cancelEditing" color="gray" size="xs">Cancel</UButton>
                  </div>
                </UForm>
              </div>

              <div v-else class="p-3">
                <!-- Server Display -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                      <UIcon name="i-material-symbols-check-circle" class="w-4 h-4 text-green-600" />
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-sm text-gray-900 dark:text-gray-100">{{ server.name }}</h4>
                        <UBadge color="blue" variant="soft" size="xs">{{ server.transport }}</UBadge>
                      </div>

                      <div class="text-xs text-gray-600 dark:text-gray-400 truncate">
                        <span v-if="server.command">{{ server.command }} {{ server.args }}</span>
                        <span v-else-if="server.url">{{ server.url }}</span>
                        <span v-if="server.env && Object.keys(server.env).length > 0" class="ml-2">
                          • {{ Object.keys(server.env).length }} env var(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <UButton @click="toggleServer(server)" color="orange" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-pause" class="text-xs" />
                    </UButton>

                    <UButton @click="startEditing(server)" color="blue" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-edit" class="text-xs" />
                    </UButton>

                    <UButton @click="confirmDelete(server)" color="red" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-delete" class="text-xs" />
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Disabled Servers -->
          <div v-if="disabledServers.length > 0" class="space-y-1">
            <div v-for="server in disabledServers" :key="server.id"
                 :class="[
                  'group relative rounded border-l-4 border-gray-300 bg-gray-50/50 hover:bg-gray-50 dark:bg-gray-900/20 dark:hover:bg-gray-900/30 transition-colors opacity-60 hover:opacity-80',
                  editingServer?.id === server.id ? 'ring-2 ring-gray-300 dark:ring-gray-700 opacity-100' : ''
                ]">
              <div v-if="editingServer?.id === server.id" class="p-3">
                <!-- Edit Form (same as above) -->
                <UForm @submit="updateServer(server)" :state="editForm" class="space-y-3">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <UFormGroup label="Server Name" name="name" size="sm">
                      <UInput v-model="editForm.name" placeholder="Server name" size="sm" />
                    </UFormGroup>

                    <UFormGroup label="Transport Type" name="transport" size="sm">
                      <USelect v-model="editForm.transport" :options="transportOptions" size="sm" />
                    </UFormGroup>
                  </div>

                  <div v-if="editIsStdioTransport" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <UFormGroup label="Command" name="command" size="sm">
                      <UInput v-model="editForm.command" placeholder="/path/to/command" size="sm" />
                    </UFormGroup>

                    <UFormGroup label="Arguments" name="args" size="sm">
                      <UInput v-model="editForm.args" placeholder="arg1 arg2 --flag" size="sm" />
                    </UFormGroup>
                  </div>

                  <div v-if="editIsUrlTransport">
                    <UFormGroup label="URL" name="url" size="sm">
                      <UInput v-model="editForm.url" placeholder="https://example.com/mcp" size="sm" />
                    </UFormGroup>
                  </div>

                  <!-- Environment Variables -->
                  <div v-if="editEnvVars.length > 0 || editingServer">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Environment Variables</label>
                      <UButton @click="addEditEnvVar" size="xs" color="gray" variant="ghost">
                        <UIcon name="i-material-symbols-add" class="text-xs" />
                      </UButton>
                    </div>
                    <div v-if="editEnvVars.length > 0" class="space-y-2">
                      <div v-for="(envVar, index) in editEnvVars" :key="index" class="flex gap-2">
                        <UInput v-model="envVar.key" placeholder="Key" class="flex-1" size="sm" />
                        <UInput v-model="envVar.value" placeholder="Value" class="flex-1" size="sm" />
                        <UButton @click="removeEditEnvVar(index)" size="xs" color="red" variant="ghost">
                          <UIcon name="i-material-symbols-delete" class="text-xs" />
                        </UButton>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <UCheckbox v-model="editForm.enabled" size="sm" />
                    <label class="text-xs">Enable server</label>
                  </div>

                  <div class="flex gap-2">
                    <UButton type="submit" color="primary" size="xs">
                      <UIcon name="i-material-symbols-save" class="mr-1 text-xs" />
                      Save
                    </UButton>
                    <UButton @click="cancelEditing" color="gray" size="xs">Cancel</UButton>
                  </div>
                </UForm>
              </div>

              <div v-else class="p-3">
                <!-- Server Display -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <UIcon name="i-material-symbols-pause-circle" class="w-4 h-4 text-gray-500" />
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-medium text-sm text-gray-600 dark:text-gray-400">{{ server.name }}</h4>
                        <UBadge color="gray" variant="soft" size="xs">{{ server.transport }}</UBadge>
                      </div>

                      <div class="text-xs text-gray-500 dark:text-gray-500 truncate">
                        <span v-if="server.command">{{ server.command }} {{ server.args }}</span>
                        <span v-else-if="server.url">{{ server.url }}</span>
                        <span v-if="server.env && Object.keys(server.env).length > 0" class="ml-2">
                          • {{ Object.keys(server.env).length }} env var(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    <UButton @click="toggleServer(server)" color="green" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-play-arrow" class="text-xs" />
                    </UButton>

                    <UButton @click="startEditing(server)" color="blue" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-edit" class="text-xs" />
                    </UButton>

                    <UButton @click="confirmDelete(server)" color="red" size="xs" variant="ghost">
                      <UIcon name="i-material-symbols-delete" class="text-xs" />
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Create Form -->
        <div v-if="showCreateForm" class="border-t pt-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold">Add New MCP Server</h3>
            <UButton @click="showCreateForm = false; resetCreateForm()" color="gray" size="xs" variant="ghost">
              <UIcon name="i-material-symbols-close" />
            </UButton>
          </div>

          <UForm @submit="createServer" :state="createForm" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <UFormGroup label="Server Name" name="name" required size="sm">
                <UInput v-model="createForm.name" placeholder="My MCP Server" size="sm" />
              </UFormGroup>

              <UFormGroup label="Transport Type" name="transport" required size="sm">
                <USelect v-model="createForm.transport" :options="transportOptions" size="sm" />
              </UFormGroup>
            </div>

            <div v-if="isStdioTransport" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <UFormGroup label="Command" name="command" required size="sm">
                <UInput v-model="createForm.command" placeholder="/usr/local/bin/uvx" size="sm" />
              </UFormGroup>

              <UFormGroup label="Arguments" name="args" required size="sm">
                <UInput v-model="createForm.args" placeholder="my-mcp-server@1.0.0" size="sm" />
              </UFormGroup>
            </div>

            <div v-if="isUrlTransport">
              <UFormGroup label="URL" name="url" required size="sm">
                <UInput v-model="createForm.url" placeholder="https://example.com/mcp" size="sm" />
              </UFormGroup>
            </div>

            <!-- Environment Variables -->
            <div v-if="createEnvVars.length > 0">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Environment Variables</label>
                <UButton @click="addCreateEnvVar" size="xs" color="gray" variant="ghost">
                  <UIcon name="i-material-symbols-add" class="text-xs" />
                </UButton>
              </div>
              <div class="space-y-2">
                <div v-for="(envVar, index) in createEnvVars" :key="index" class="flex gap-2">
                  <UInput v-model="envVar.key" placeholder="API_KEY" class="flex-1" size="sm" />
                  <UInput v-model="envVar.value" placeholder="your-api-key" type="password" class="flex-1" size="sm" />
                  <UButton @click="removeCreateEnvVar(index)" size="xs" color="red" variant="ghost">
                    <UIcon name="i-material-symbols-delete" class="text-xs" />
                  </UButton>
                </div>
              </div>
            </div>

            <div v-else class="flex justify-start">
              <UButton @click="addCreateEnvVar" size="xs" color="gray" variant="outline">
                <UIcon name="i-material-symbols-add" class="mr-1 text-xs" />
                Add Environment Variables
              </UButton>
            </div>

            <div class="flex items-center gap-2">
              <UCheckbox v-model="createForm.enabled" size="sm" />
              <label class="text-xs">Enable server immediately</label>
            </div>

            <div class="flex gap-2">
              <UButton type="submit" color="primary" size="sm">
                <UIcon name="i-material-symbols-add" class="mr-1" />
                Create Server
              </UButton>
              <UButton @click="showCreateForm = false; resetCreateForm()" color="gray" size="sm">Cancel</UButton>
            </div>
          </UForm>
        </div>
      </div>
    </SettingsCard>
  </ClientOnly>
</template>
