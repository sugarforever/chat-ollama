<script setup lang="ts">
import type { ContextKeys } from '~/server/middleware/keys'
import { keysStore } from '~/utils/settings'
import type { PickupPathKey, TransformTypes } from '~/types/helper'

const toast = useToast()

interface LLMListItem {
  title: string
  fields: Array<{
    label: string
    value: PickupPathKey<ContextKeys>
    type: 'input' | 'password'
    placeholder?: string
    rule?: 'url'
  }>
}

const LLMList: LLMListItem[] = [
  {
    title: 'Ollama Server',
    fields: [
      { label: 'Endpoint', value: 'ollama.endpoint', type: 'input', placeholder: '', rule: 'url' },
      { label: 'User Name', value: 'ollama.username', type: 'input', placeholder: 'Optional' },
      { label: 'Password', value: 'ollama.password', type: 'password', placeholder: 'Optional' },
    ]
  },
  {
    title: 'OpenAI',
    fields: [
      { label: 'Key', value: 'openai.key', type: 'password', placeholder: 'OpenAI API Key' },
      { label: 'Endpoint', value: 'openai.endpoint', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Azure OpenAI',
    fields: [
      { label: 'Key', value: 'azureOpenai.key', type: 'password', placeholder: 'Azure OpenAI API Key' },
      { label: 'Endpoint', value: 'azureOpenai.endpoint', type: 'input' },
      { label: 'Deployment Name', value: 'azureOpenai.deploymentName', type: 'input' },
    ]
  },
  {
    title: 'Anthropic',
    fields: [
      { label: 'Key', value: 'anthropic.key', type: 'password', placeholder: 'Anthropic API Key' },
      { label: 'Endpoint', value: 'anthropic.endpoint', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Moonshot',
    fields: [
      { label: 'Key', value: 'moonshot.key', type: 'password', placeholder: 'Moonshot API Key' },
      { label: 'Endpoint', value: 'moonshot.endpoint', type: 'input', placeholder: 'Optional', rule: 'url' },
    ]
  },
  {
    title: 'Gemini',
    fields: [
      { label: 'Key', value: 'gemini.key', type: 'password', placeholder: 'Gemini API Key' },
    ]
  },
  {
    title: 'Groq',
    fields: [
      { label: 'Key', value: 'groq.key', type: 'password', placeholder: 'Groq API Key' },
      { label: 'Endpoint', value: 'groq.endpoint', type: 'input', placeholder: 'Optional' },
    ]
  },
]

const currentLLM = ref(LLMList[0].title)
const currentLLMFields = computed(() => LLMList.find(el => el.title === currentLLM.value)!.fields)
const state = reactive(getData())

const validate = (data: typeof state) => {
  const errors: Array<{ path: string, message: string } | null> = []

  LLMList.flatMap(el => el.fields).filter(el => el.rule).forEach(el => {
    const key = el.value
    if (el.rule === 'url' && data[key]) {
      errors.push(checkHost(key, el.label))
    }
  })

  return errors.flatMap(el => el ? el : [])
}

const onSubmit = async () => {
  keysStore.value = recursiveObject(keysStore.value, (keyPaths, value) => {
    const key = keyPaths.join('.') as keyof typeof state
    return key in state ? state[key] : value
  })

  toast.add({ title: `Set successfully!`, color: 'green' })
}

const checkHost = (key: keyof typeof state, title: string) => {
  const url = state[key]
  if (!url || (typeof url === 'string' && /^https?:\/\//i.test(url))) return null

  return { path: key, message: `${title} must start with http:// or https://` }
}

function getData() {
  return LLMList.reduce((acc, cur) => {
    cur.fields.forEach(el => {
      (acc as any)[el.value] = el.value.split('.').reduce((a, c) => (a as any)[c], keysStore.value)
    })
    return acc
  }, {} as TransformTypes<PickupPathKey<ContextKeys>>)
}

function recursiveObject(obj: Record<string, any>, cb: (keyPaths: string[], value: any) => any) {
  const newObj = {} as any

  function recursive(oldObj: Record<string, any>, objPart: Record<string, any>, keyPaths: string[] = []) {
    for (const key in oldObj) {
      if (oldObj.hasOwnProperty(key)) {
        const value = oldObj[key]
        if (typeof value === 'object' && value !== null) {
          newObj[key] = {}
          recursive(oldObj[key], newObj[key], [...keyPaths, key])
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
