<script setup lang="ts">
const { t } = useI18n()
const colorMode = useColorMode()

const icons = ['i-material-symbols-desktop-windows-outline-rounded', 'i-heroicons-sun-20-solid', 'i-heroicons-moon-20-solid']

const list = computed(() => {
  return [
    { label: t('colorMode.system'), value: 'system', icon: icons[0] },
    { label: t('colorMode.light'), value: 'light', icon: icons[1] },
    { label: t('colorMode.dark'), value: 'dark', icon: icons[2] },
  ]
})

const currentIcon = ref(list.value[0].icon)
const items = computed(() => {
  return list.value.map(item => {
    return {
      ...item,
      click: () => {
        colorMode.preference = item.value
        currentIcon.value = item.icon
      }
    }
  })
})

onMounted(() => {
  currentIcon.value = list.value.find(el => el.value === colorMode.preference)?.icon || ''
})
</script>

<template>
  <UDropdown :items="[items]"
             :ui="{ width: 'w-32' }"
             :popper="{ placement: 'bottom-start' }">
    <UButton :icon="currentIcon"
             color="gray"
             variant="ghost"
             aria-label="Theme"
             @touchstart.stop />

    <template #item="{ item }">
      <div class="flex items-center" :class="{ 'text-primary-500': item.value === colorMode.preference }">
        <UIcon :name="item.icon" class="opacity-70 text-lg" />
        <span class="ml-2">{{ item.label }}</span>
      </div>
    </template>
  </UDropdown>
</template>
