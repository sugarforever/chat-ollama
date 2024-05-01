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

const proxyTips = t('Only works when the current Endpoint and Proxy Settings is set')
const LLMList: LLMListItem[] = [
  {
    title: t('settings.ollamaServer'),
    fields: [
      { label: t('settings.endpoint'), value: 'ollama.endpoint', type: 'input', placeholder: '', rule: 'url' },
      { label: t('global.userName'), value: 'ollama.username', type: 'input', placeholder: t('global.optional') },
      { label: t('global.password'), value: 'ollama.password', type: 'password', placeholder: t('global.optional') }
    ]
  },
  {
    title: t('settings.OpenAI'),
    fields: [
      { label: t('settings.key'), value: 'openai.key', type: 'password', placeholder: t('settings.OpenAI API Key') },
      { label: t('settings.endpoint'), value: 'openai.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
      { label: t('settings.proxy'), value: 'openai.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('settings.Azure OpenAI'),
    fields: [
      { label: t('settings.key'), value: 'azureOpenai.key', type: 'password', placeholder: t('settings.Azure OpenAI API Key') },
      { label: t('settings.endpoint'), value: 'azureOpenai.endpoint', type: 'input' },
      { label: t('settings.deploymentName'), value: 'azureOpenai.deploymentName', type: 'input' },
      { label: t('settings.proxy'), value: 'azureOpenai.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('settings.Anthropic'),
    fields: [
      { label: t('settings.key'), value: 'anthropic.key', type: 'password', placeholder: t('settings.Anthropic API Key') },
      { label: t('settings.endpoint'), value: 'anthropic.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
      { label: t('settings.proxy'), value: 'anthropic.proxy', type: 'checkbox', placeholder: proxyTips },
    ]
  },
  {
    title: t('settings.Moonshot'),
    fields: [
      { label: t('settings.key'), value: 'moonshot.key', type: 'password', placeholder: t('settings.Moonshot API Key') },
      { label: t('settings.endpoint'), value: 'moonshot.endpoint', type: 'input', placeholder: t('global.optional'), rule: 'url' },
    ]
  },
  {
    title: t('settings.Gemini'),
    fields: [
      { label: t('settings.key'), value: 'gemini.key', type: 'password', placeholder: t('settings.Gemini API Key') },
    ]
  },
  {
    title: t('settings.Groq'),
    fields: [
      { label: t('settings.key'), value: 'groq.key', type: 'password', placeholder: t('settings.Groq API Key') },
      { label: t('settings.endpoint'), value: 'groq.endpoint', type: 'input', placeholder: t('global.optional') },
      { label: t('settings.proxy'), value: 'groq.proxy', type: 'checkbox', placeholder: proxyTips },
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

  toast.add({ title: t(`settings.Set successfully!`), color: 'green' })
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
            {{ t("global.save") }}
          </UButton>
        </div>
      </SettingsCard>
    </UForm>
  </ClientOnly>
</template>
