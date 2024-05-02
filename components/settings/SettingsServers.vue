<script setup lang="ts">
import type { ContextKeys } from '~/server/middleware/keys'
import { keysStore } from '~/utils/settings'
import type { PickupPathKey, TransformTypes } from '~/types/helper'
import { useI18n } from "vue-i18n"
const { t } = useI18n()

const toast = useToast()

interface LLMListItem {
  key: string
  title: string
  fields: Array<{
    label: string
    value: PickupPathKey<ContextKeys>
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
const currentLLMFields = computed(() => LLMList.value.find(el => el.key === currentLLM.value)!.fields)
const state = reactive(getData())

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
  keysStore.value = recursiveObject(keysStore.value, (keyPaths, value) => {
    const key = keyPaths.join('.') as keyof typeof state
    return key in state ? state[key] : value
  })

  toast.add({ title: t(`settings.setSuccessfully`), color: 'green' })
}

const checkHost = (key: keyof typeof state, title: string) => {
  const url = state[key]
  if (!url || (typeof url === 'string' && /^https?:\/\//i.test(url))) return null

  return { path: key, message: t('settings.linkRuleMessage', [title]) }
}

function getData() {
  return LLMList.value.reduce((acc, cur) => {
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
            <UButton v-for="item in LLMList"
                     :key="item.key"
                     :color="currentLLM == item.key ? 'primary' : 'gray'"
                     class="m-1"
                     @click="currentLLM = item.key">{{ item.title }}</UButton>
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
