<script lang="ts" setup>

const props = defineProps<{
  title?: string
  subtitle?: string
}>()

const slots = useSlots()

const ui = {
  header: {
    base: ['font-bold', 'rounded-lg', props.title || props.subtitle || slots.header ? '' : 'hidden'],
    background: 'bg-[rgb(var(--color-gray-50))] dark:bg-[rgb(var(--color-gray-900))]',
    padding: 'p-1',
  },
  body: {
    background: 'dark:bg-gray-800/10',
  }
}
</script>

<template>
  <UCard :ui>
    <template #header>
      <slot name="header">
        <div class="py-2">
          {{ title }}
          <span v-if="subtitle" class="ml-2 font-normal" v-html="subtitle"></span>
        </div>
      </slot>
    </template>
    <slot />
  </UCard>
</template>
