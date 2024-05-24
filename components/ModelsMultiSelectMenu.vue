<script lang="ts" setup>
import type { ModelInfo } from '~/composables/useModels'

const props = withDefaults(defineProps<{
  autoDefault?: boolean,
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  autoDefault: true,
})

const emits = defineEmits<{
  change: [models: string[], modelsRaw: ModelInfo[]]
}>()

const models = defineModel<string[]>({ default: [] })

const { t } = useI18n()
const { chatModels } = useModels()

const uiMenu = {
  container: 'z-20 group w-[unset] whitespace-nowrap !w-auto',
  option: { base: 'cursor-default select-none relative flex items-center justify-between gap-1 pr-5' }
}

function onChange(models: string[]) {
  const modelsRaw = chatModels.value.filter(model => models.includes(model.value))
  emits('change', models, modelsRaw)
}

</script>

<template>
  <ClientOnly>
    <USelectMenu v-model="models"
                 :options="chatModels"
                 value-attribute="value"
                 :size
                 multiple
                 :ui-menu="uiMenu"
                 :popper="{ placement: 'top-start' }"
                 :placeholder="t('global.selectModels')"
                 @change="onChange">
      <template #label>
        <div class="text-muted">
          <UIcon name="i-heroicons-rectangle-stack" class="mr-1"></UIcon>
          <span>{{ models?.length }} Models</span>
        </div>
      </template>
      <template #option="{ option }">
        <span>{{ option.family }}</span>
        <span class="text-muted">/</span>
        <span>{{ option.label }}</span>
      </template>
    </USelectMenu>
  </ClientOnly>
</template>
