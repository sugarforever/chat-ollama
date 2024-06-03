<script lang="ts" setup>
import { useMediaQuery } from '@vueuse/core'

const props = defineProps<{
  data: ChatSession
}>()

const emits = defineEmits<{
  pin: [data: ChatSession]
  unpin: [data: ChatSession]
  delete: [data: ChatSession]
}>()

const { t } = useI18n()
const isTouchDevice = useMediaQuery('(hover: none) and (pointer: coarse)')

const open = ref(false)

const buttons = computed(() => {
  return [
    { label: t('chat.pin'), type: 'pin', icon: 'i-material-symbols-keep-outline', color: 'gray', class: '', visible: !props.data.isTop },
    { label: t('chat.unpin'), type: 'unpin', icon: 'i-material-symbols-keep-off-outline', color: 'gray', class: '', visible: props.data.isTop },
    { label: t('chat.deleteChat'), type: 'delete', icon: 'i-material-symbols-delete-outline', color: 'red', class: '', visible: true },
  ] as const
})

function onClick(type: 'pin' | 'unpin' | 'delete') {
  open.value = false
  switch (type) {
    case 'pin':
      emits('pin', props.data)
      break
    case 'unpin':
      emits('unpin', props.data)
      break
    case 'delete':
      emits('delete', props.data)
      break
  }
}
</script>

<template>
  <div v-if="isTouchDevice" class="flex">
    <template v-for="item in buttons" :key="item.type">
      <UButton v-if="item.visible"
               :icon="item.icon"
               color="gray"
               variant="ghost"
               size="sm"
               class="opacity-50 mx-2"
               @click="onClick(item.type)"></UButton>
    </template>
  </div>
  <UPopover v-else v-model:open="open" mode="hover">
    <UButton icon="i-material-symbols-more-vert" variant="link" color="gray" size="sm" class="opacity-50"></UButton>
    <template #panel>
      <div class="flex flex-col py-2 opacity-90">
        <template v-for="item, i in buttons" :key="item.type">
          <UButton v-if="item.visible"
                   :icon="item.icon"
                   :color="item.color"
                   variant="ghost"
                   :class="{ 'border-t dark:border-gray-800': i > 0 }"
                   class="rounded-none px-4"
                   @click="onClick(item.type)">{{ item.label }}</UButton>
        </template>
      </div>
    </template>
  </UPopover>
</template>
