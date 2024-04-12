<script setup lang="ts">

import * as settings from '@/utils/settings'

const toast = useToast()

const fields = [
  'ollamaHost', 'ollamaUsername', 'ollamaPassword',
  'openAiApiKey', 'openAiApiHost',
  'azureOpenaiApiKey', 'azureOpenaiEndpoint', 'azureOpenaiDeploymentName',
  'anthropicApiKey', 'anthropicApiHost',
  'moonshotApiKey', 'moonshotApiHost',
  'geminiApiKey',
  'groqApiKey', 'groqApiHost',
] as const

interface LLMListItem {
  title: string
  fields: Array<{
    label: string
    value: typeof fields[number]
    type: 'input' | 'password'
    placeholder?: string
    rule?: 'url'
  }>
}

const LLMList: LLMListItem[] = [
  {
    title: 'Ollama Server',
    fields: [
      { label: 'Host', value: 'ollamaHost', type: 'input', placeholder: '', rule: 'url' },
      { label: 'User Name', value: 'ollamaUsername', type: 'input', placeholder: 'Optional' },
      { label: 'Password', value: 'ollamaPassword', type: 'password', placeholder: 'Optional' },
    ]
  },
  {
    title: 'OpenAI',
    fields: [
      { label: 'API Key', value: 'openAiApiKey', type: 'password', placeholder: 'OpenAI API Key' },
      { label: 'Custom API host', value: 'openAiApiHost', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Azure OpenAI',
    fields: [
      { label: 'API Key', value: 'azureOpenaiApiKey', type: 'password', placeholder: 'Azure OpenAI API Key' },
      { label: 'Endpoint', value: 'azureOpenaiEndpoint', type: 'input' },
      { label: 'Deployment Name', value: 'azureOpenaiDeploymentName', type: 'input' },
    ]
  },
  {
    title: 'Anthropic',
    fields: [
      { label: 'API Key', value: 'anthropicApiKey', type: 'password', placeholder: 'Anthropic API Key' },
      { label: 'Custom API host', value: 'anthropicApiHost', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Moonshot',
    fields: [
      { label: 'API Key', value: 'moonshotApiKey', type: 'password', placeholder: 'Moonshot API Key' },
      { label: 'Custom API host', value: 'moonshotApiHost', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Gemini',
    fields: [
      { label: 'API Key', value: 'geminiApiKey', type: 'password', placeholder: 'Gemini API Key' },
    ]
  },
  {
    title: 'Groq',
    fields: [
      { label: 'API Key', value: 'groqApiKey', type: 'password', placeholder: 'Groq API Key' },
      { label: 'API Host', value: 'groqApiHost', type: 'input', placeholder: 'Optional' },
    ]
  },
]
const currentLLM = ref(LLMList[0].title)
const currentLLMFields = computed(() => LLMList.find(el => el.title === currentLLM.value)!.fields)

const state = reactive(getData())

const validate = (data: typeof state) => {
  const errors: Array<{ path: string, message: string } | null> = []

  LLMList.flatMap(el => el.fields).filter(el => el.rule).forEach(el => {
    const key = el.value as keyof typeof data
    if (el.rule === 'url' && data[key]) {
      errors.push(checkHost(key, el.label))
    }
  })

  return errors.flatMap(el => el ? el : [])
}

const onSubmit = async () => {
  fields.forEach(key => {
    settings[key].value = state[key]
  })
  toast.add({ title: `Set successfully!`, color: 'green' })
}

const checkHost = (key: typeof fields[number], title: string) => {
  const url = state[key]
  if (!url || /^https?:\/\//i.test(url)) return null

  return { path: key, message: `${title} must start with http:// or https://` }
}

function getData() {
  return fields.reduce((acc, cur) => {
    acc[cur] = settings[cur].value
    return acc
  }, {} as Record<typeof fields[number], string>)
}
</script>

<template>
  <ClientOnly>
    <UForm :validate="validate" :state="state" class="max-w-6xl mx-auto" @submit="onSubmit">
      <SettingsCard>
        <template #header>
          <div class="flex flex-wrap">
            <UButton v-for="item, i in LLMList"
                     :key="item.title"
                     :color="currentLLM == item.title ? 'primary' : 'gray'"
                     class="m-1"
                     @click="currentLLM = item.title">{{ item.title }}</UButton>
          </div>
        </template>
        <div>
          <UFormGroup v-for="item in currentLLMFields"
                      :key="item.value"
                      :label="item.label"
                      :name="item.value"
                      class="mb-4">
            <UInput v-model.trim="state[item.value as keyof typeof state]"
                    :type="item.type"
                    :placeholder="item.placeholder"
                    size="lg"
                    :rule="item.rule" />
          </UFormGroup>
        </div>

        <div class="">
          <UButton type="submit">
            Save
          </UButton>
        </div>
      </SettingsCard>
    </UForm>
  </ClientOnly>
</template>
