<script setup lang="ts">
import type { ContextKeys } from '~/server/middleware/keys'
import { keysStore } from '~/utils/settings'
import type { PickupPathKey, TransformTypes } from '~/types/helper'
import {useI18n} from "vue-i18n";
const { t } = useI18n()

const toast = useToast()

interface LLMListItem {
  title: string
  fields: Array<{
    label: string
    value: PickupPathKey<ContextKeys>
    type: 'input' | 'password' | 'checkbox'
    placeholder?: string
    rule?: 'url'
  }>
}

const proxyTips = 'Only works when the current Endpoint and Proxy Settings is set.'
const LLMList: LLMListItem[] = [
  {
    title: t('Ollama Server'),
    fields: [
      { label: t('Endpoint'), value: 'ollama.endpoint', type: 'input', placeholder: '', rule: t('url') },
      { label: t('User Name'), value: 'ollama.username', type: 'input', placeholder: t('Optional') },
      { label: t('Password'), value: 'ollama.password', type: 'password', placeholder: t('Optional') }
    ]
  },
  {
    title: t('OpenAI'),
    fields: [
      { label: t('Key'), value: 'openai.key', type: 'password', placeholder: t('OpenAI API Key') },
      { label: t('Endpoint'), value: 'openai.endpoint', type: 'input', placeholder: t('Optional'), rule: 'url' },
      { label: t('Proxy'), value: 'openai.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('Azure OpenAI'),
    fields: [
      { label: t('Key'), value: 'azureOpenai.key', type: 'password', placeholder: t('Azure OpenAI API Key') },
      { label: t('Endpoint'), value: 'azureOpenai.endpoint', type: 'input' },
      { label: t('Deployment Name'), value: 'azureOpenai.deploymentName', type: 'input' },
      { label: t('Proxy'), value: 'azureOpenai.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('Anthropic'),
    fields: [
      { label: t('Key'), value: 'anthropic.key', type: 'password', placeholder: t('Anthropic API Key') },
      { label: t('Endpoint'), value: 'anthropic.endpoint', type: 'input', placeholder: t('Optional'), rule: 'url' },
      { label: t('Proxy'), value: 'anthropic.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('Moonshot'),
    fields: [
      { label: t('Key'), value: 'moonshot.key', type: 'password', placeholder: t('Moonshot API Key') },
      { label: t('Endpoint'), value: 'moonshot.endpoint', type: 'input', placeholder: t('Optional'), rule: 'url' },
    ]
  },
  {
    title: t('Gemini'),
    fields: [
      { label: t('Key'), value: 'gemini.key', type: 'password', placeholder: t('Gemini API Key') },
    ]
  },
  {
    title: t('Groq'),
    fields: [
      { label: t('Key'), value: 'groq.key', type: 'password', placeholder: t('Groq API Key') },
      { label: t('Endpoint'), value: 'groq.endpoint', type: 'input', placeholder: t('Optional') },
      { label: t('Proxy'), value: 'groq.proxy', type: 'checkbox', placeholder: proxyTips },
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

  toast.add({ title: t(`Set successfully!`), color: 'green' })
}

const checkHost = (key: keyof typeof state, title: string) => {
  const url = state[key]
  if (!url || (typeof url === 'string' && /^https?:\/\//i.test(url))) return null

  return { path: key, message: `${title} ${t("must start with http:// or https://")}` }
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
          <template v-for="item in currentLLMFields" :key="item.value">
            <UFormGroup v-if="item.value.endsWith('proxy') ? $config.public.modelProxyEnabled : true" :label="item.label"
                        :name="item.value"
                        class="mb-4">
              <UInput v-if="item.type === 'input' || item.type === 'password'"
                      v-model.trim="state[item.value] as string"
                      :type="item.type"
                      :placeholder="item.placeholder"
                      size="lg"
                      :rule="item.rule" />
              <template v-else-if="item.type === 'checkbox'">
                <label class="flex items-center">
                  <UCheckbox v-model="state[item.value] as boolean"></UCheckbox>
                  <span class="ml-2 text-sm text-muted">({{ item.placeholder }})</span>
                </label>
              </template>
            </UFormGroup>
          </template>
        </div>

        <div class="">
          <UButton type="submit">
            {{ t("Save") }}
          </UButton>
        </div>
      </SettingsCard>
    </UForm>
  </ClientOnly>
</template>
