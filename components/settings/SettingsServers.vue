<script setup lang="ts">
import type { ContextKeys } from '~/server/middleware/keys'
import { keysStore, DEFAULT_KEYS_STORE } from '~/utils/settings'
import type { PickupPathKey, TransformTypes } from '~/types/helper'
import CreateCustomServer from './CreateCustomServer.vue'
import CustomServerForm from './CustomServerForm.vue'
import { deepClone } from '~/composables/helpers'

type PathKeys = PickupPathKey<Omit<ContextKeys, 'custom'>>

const { t } = useI18n()
const toast = useToast()
const modal = useModal()
const { loadModels } = useModels({ forceReload: true })

interface LLMListItem {
    key: string
    title: string
    fields: Array<{
        label: string
        value: PathKeys
        type: 'input' | 'password' | 'checkbox'
        placeholder?: string
        rule?: 'url'
    }>
}

const LLMList = computed<LLMListItem[]>(() => {
    return [
        {
            key: 'ollamaServer',
            title: t('settings.ollamaServer'),
            fields: [
                { label: t('settings.endpoint'), value: 'ollama.endpoint', type: 'input', placeholder: '', rule: 'url' },
                { label: t('global.userName'), value: 'ollama.username', type: 'input', placeholder: t('global.optional') },
                { label: t('global.password'), value: 'ollama.password', type: 'password', placeholder: t('global.optional') }
            ]
        },
        {
            key: 'openAi',
            title: t('settings.openAi'),
            fields: [
                { label: t('settings.apiKey'), value: 'openai.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'openai.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
                { label: t('settings.proxy'), value: 'openai.proxy', type: 'checkbox', placeholder: t('settings.proxyTips') },
            ]
        },
        {
            key: 'azureOpenAi',
            title: t('settings.azureOpenAi'),
            fields: [
                { label: t('settings.apiKey'), value: 'azureOpenai.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'azureOpenai.endpoint', type: 'input' },
                { label: t('settings.azureDeploymentName'), value: 'azureOpenai.deploymentName', type: 'input' },
                { label: t('settings.proxy'), value: 'azureOpenai.proxy', type: 'checkbox', placeholder: t('settings.proxyTips') },
            ]
        },
        {
            key: 'anthropic',
            title: t('settings.anthropic'),
            fields: [
                { label: t('settings.apiKey'), value: 'anthropic.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'anthropic.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
                { label: t('settings.proxy'), value: 'anthropic.proxy', type: 'checkbox', placeholder: t('settings.proxyTips') },
            ]
        },
        {
            key: 'moonshot',
            title: t('settings.moonshot'),
            fields: [
                { label: t('settings.apiKey'), value: 'moonshot.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'moonshot.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
            ]
        },
        {
            key: 'gemini',
            title: t('settings.gemini'),
            fields: [
                { label: t('settings.apiKey'), value: 'gemini.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'gemini.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
                { label: t('settings.proxy'), value: 'gemini.proxy', type: 'checkbox', placeholder: t('settings.proxyTips') },
            ]
        },
        {
            key: 'groq',
            title: t('settings.groq'),
            fields: [
                { label: t('settings.apiKey'), value: 'groq.key', type: 'password', placeholder: t('settings.apiKey') },
                { label: t('settings.endpoint'), value: 'groq.endpoint', type: 'input', placeholder: t('global.optional') },
                { label: t('settings.proxy'), value: 'groq.proxy', type: 'checkbox', placeholder: t('settings.proxyTips') },
            ]
        },
    ]
})

const currentLLM = ref(LLMList.value[0].key)
const currentLLMFields = computed(() => LLMList.value.find(el => el.key === currentLLM.value)?.fields || [])
const state = reactive(getData())
const currentCustomServer = computed(() => state.custom.find(el => el.name === currentLLM.value))

const validate = (data: typeof state) => {
    const errors: Array<{ path: string, message: string } | null> = []

    LLMList.value.flatMap(el => el.fields).filter(el => el.rule).forEach(el => {
        const key = el.value
        if (el.rule === 'url' && data[key]) {
            errors.push(checkHost(key, el.label))
        }
    })

    return errors.flatMap(el => el ? el : [])
}

const onSubmit = async () => {
    keysStore.value = recursiveObject(DEFAULT_KEYS_STORE, (keyPaths, value) => {
        const key = keyPaths.join('.') as keyof typeof state
        return key in state ? state[key] : value
    })

    try {
        loadModels()
    } catch (error) {
        console.warn('Failed to reload models in SettingsServers:', error)
    }

    toast.add({ title: t(`settings.setSuccessfully`), color: 'green' })
}

function onAddCustomServer() {
    modal.open(CreateCustomServer, {
        onClose: () => modal.close(),
        onCreate: name => {
            if (state.custom.some(el => el.name === name)) {
                toast.add({ title: t(`settings.customServiceNameExists`), color: 'red' })
                return
            }
            const data: ContextKeys['custom'][number] = {
                name,
                aiType: 'openai',
                endpoint: '',
                key: '',
                models: [],
                proxy: false,
            }
            state.custom.push(data)
            keysStore.value = Object.assign(keysStore.value, { custom: (keysStore.value.custom || []).concat(data) })
            currentLLM.value = name
            modal.close()
        }
    })
}

function onUpdateCustomServer(data: ContextKeys['custom'][number]) {
    const index = state.custom.findIndex(el => el.name === currentCustomServer.value!.name)
    state.custom[index] = data
    keysStore.value.custom.splice(index, 1, data)

    try {
        loadModels()
    } catch (error) {
        console.warn('Failed to reload models in SettingsServers:', error)
    }

    toast.add({ title: t(`settings.setSuccessfully`), color: 'green' })
}

function onRemoveCustomServer() {
    const index = state.custom.findIndex(el => el.name === currentCustomServer.value!.name)
    state.custom.splice(index, 1)
    keysStore.value.custom.splice(index, 1)
    currentLLM.value = LLMList.value[0].key

    try {
        loadModels()
    } catch (error) {
        console.warn('Failed to reload models in SettingsServers:', error)
    }
}

const checkHost = (key: keyof typeof state, title: string) => {
    const url = state[key]
    if (!url || (typeof url === 'string' && /^https?:\/\//i.test(url))) return null

    return { path: key, message: t('settings.linkRuleMessage', [title]) }
}

const { hasBrandIcon, getFallbackIcon, preloadCommonIcons } = useBrandIcons()

// Preload common icons on component mount
onMounted(() => {
    preloadCommonIcons()
})

function getServerIcon(key: string): string {
    return getFallbackIcon(key)
}

function getCurrentServerTitle(): string {
    const server = LLMList.value.find(el => el.key === currentLLM.value)
    if (server) return server.title

    const customServer = state.custom.find(el => el.name === currentLLM.value)
    if (customServer) return customServer.name

    return ''
}

function getData() {
    const data = LLMList.value.reduce((acc, cur) => {
        cur.fields.forEach(el => {
            (acc as any)[el.value] = el.value.split('.').reduce((a, c) => (a as any)[c], keysStore.value)
        })
        return acc
    }, {} as TransformTypes<PathKeys> & Pick<ContextKeys, 'custom'>)
    data.custom = deepClone(keysStore.value.custom || [])
    return data
}

function recursiveObject(obj: Record<string, any>, cb: (keyPaths: string[], value: any) => any) {
    const newObj = {} as any

    function recursive(oldObj: Record<string, any>, objPart: Record<string, any>, keyPaths: string[] = []) {
        for (const key in oldObj) {
            if (oldObj.hasOwnProperty(key)) {
                const value = oldObj[key]
                if (key === 'custom') {
                    newObj[key] = cb([key], value)
                } else if (typeof value === 'object' && value !== null) {
                    newObj[key] = {}
                    recursive(oldObj[key], newObj[key], [...keyPaths, key])
                } else if (keyPaths.length === 0) {
                    newObj[key] = cb([key], value)
                } else {
                    objPart[key] = cb([...keyPaths, key], value)
                }
            }
        }
    }

    recursive(obj, {}, [])

    return newObj
}

</script>

<template>
    <ClientOnly>
        <div class="max-w-6xl mx-auto">
            <SettingsCard>
                <template #header>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 py-2">{{ t('settings.serverConfiguration') }}</h3>
                </template>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Server List -->
                    <div class="lg:col-span-1">
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('settings.servers') }}</h4>
                                <UTooltip :text="t('settings.customApiService')" :popper="{ placement: 'top' }">
                                    <UButton size="xs"
                                             variant="ghost"
                                             color="gray"
                                             icon="i-material-symbols-add"
                                             @click="onAddCustomServer" />
                                </UTooltip>
                            </div>

                            <div class="space-y-2 max-h-96 overflow-y-auto">
                                <!-- Built-in Servers -->
                                <div class="space-y-1">
                                    <h5 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{ t('settings.builtInServers') }}</h5>
                                    <div v-for="item in LLMList"
                                         :key="item.key"
                                         @click="currentLLM = item.key"
                                         :class="[
                                            'flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200',
                                            currentLLM === item.key
                                                ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                                        ]">
                                        <BrandIcon
                                                   :server-key="item.key"
                                                   size="md"
                                                   class="mr-3"
                                                   :class="currentLLM === item.key ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'" />
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium truncate" :class="currentLLM === item.key ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'">
                                                {{ item.title }}
                                            </p>
                                        </div>
                                        <UIcon v-if="currentLLM === item.key" name="i-material-symbols-check" class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    </div>
                                </div>

                                <!-- Custom Servers -->
                                <div v-if="state.custom.length > 0" class="space-y-1">
                                    <h5 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{ t('settings.customServers') }}</h5>
                                    <div v-for="item in state.custom"
                                         :key="item.name"
                                         @click="currentLLM = item.name"
                                         :class="[
                                            'flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200',
                                            currentLLM === item.name
                                                ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                                        ]">
                                        <UIcon name="i-material-symbols-settings-suggest" class="w-5 h-5 mr-3 flex-shrink-0" :class="currentLLM === item.name ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'" />
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium truncate" :class="currentLLM === item.name ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-gray-100'">
                                                {{ item.name }}
                                            </p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ item.aiType }}</p>
                                        </div>
                                        <UIcon v-if="currentLLM === item.name" name="i-material-symbols-check" class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Form Area -->
                    <div class="lg:col-span-2">
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                            <div v-if="currentLLMFields.length > 0">
                                <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                    {{ getCurrentServerTitle() }}
                                </h4>
                                <UForm :validate="validate" :state="state" @submit="onSubmit">
                                    <template v-for="item in currentLLMFields" :key="item.value">
                                        <UFormGroup v-if="item.value.endsWith('proxy') ? $config.public.modelProxyEnabled : true" :label="item.label"
                                                    :name="item.value"
                                                    class="mb-4">
                                            <UInput v-if="item.type === 'input' || item.type === 'password'"
                                                    v-model.trim="state[item.value]"
                                                    :type="item.type"
                                                    :placeholder="item.placeholder"
                                                    size="lg"
                                                    :rule="item.rule" />
                                            <template v-else-if="item.type === 'checkbox'">
                                                <label class="flex items-center">
                                                    <UCheckbox v-model="state[item.value]"></UCheckbox>
                                                    <span class="ml-2 text-sm text-muted">({{ item.placeholder }})</span>
                                                </label>
                                            </template>
                                        </UFormGroup>
                                    </template>
                                    <div class="pt-4">
                                        <UButton type="submit" size="lg">
                                            {{ t("global.save") }}
                                        </UButton>
                                    </div>
                                </UForm>
                            </div>
                            <template v-else-if="currentCustomServer">
                                <CustomServerForm :value="currentCustomServer"
                                                  :key="currentLLM"
                                                  @update="d => onUpdateCustomServer(d)" @remove="onRemoveCustomServer()" />
                            </template>
                        </div>
                    </div>
                </div>
            </SettingsCard>
        </div>
    </ClientOnly>
</template>
