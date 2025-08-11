<script setup lang="ts">
const { t } = useI18n()

// Add props for collapsed state
interface Props {
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

const { signOut, data, status } = useAuth()
const onClickSignOut = async () => {
  await signOut({ callbackUrl: '/' })
}

const items = [
  [{
    label: t('auth.signOut'),
    click: async () => {
      await onClickSignOut()
    }
  }]
]

const buttonColor = computed(() => {
  return data?.value?.role === 'superadmin' ? 'red' : 'primary'
})
</script>
<template>
  <UButton v-if="status === 'unauthenticated'"
           :label="collapsed ? undefined : t('auth.signIn')"
           :icon="collapsed ? 'i-heroicons-user-circle' : undefined"
           to="/login"
           :color="collapsed ? 'gray' : 'primary'"
           :variant="collapsed ? 'ghost' : 'solid'"
           :class="collapsed ? 'w-11 h-11 p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg justify-center' : 'px-4 py-2'"
           class="font-medium transition-colors"></UButton>
  <div v-else>
    <UDropdown :items="items" :popper="{ placement: 'bottom-end' }">
      <UButton :color="collapsed ? 'gray' : buttonColor"
               :variant="collapsed ? 'ghost' : 'solid'"
               :label="collapsed ? undefined : data?.name"
               :icon="collapsed ? 'i-heroicons-user-circle' : undefined"
               :class="collapsed ? 'w-11 h-11 p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg justify-center' : 'px-4 py-2'"
               class="font-medium transition-colors" />
    </UDropdown>
  </div>
</template>
