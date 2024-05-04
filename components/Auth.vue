<script setup lang="ts">
const { t } = useI18n()

const { signOut, data, status } = useAuth()
const onClickSignOut = async () => {
  await signOut({ callbackUrl: '/' })
}

const items = [
  [{
    label: t('auth.signOut'),
    icon: 'i-heroicons-arrow-right-start-on-rectangle-16-solid',
    click: async () => {
      await onClickSignOut()
    }
  }]
]

const buttonColor = computed(() => {
  return data?.value?.role === 'superadmin' ? 'red' : 'white'
})
</script>
<template>
  <UButton v-if="status === 'unauthenticated'" :label="t('auth.signIn')" to="/login" color="white"></UButton>
  <div v-else>
    <UDropdown :items="items" :popper="{ placement: 'bottom-end' }">
      <UButton :color="buttonColor" :label="data?.name" trailing-icon="i-heroicons-chevron-down-20-solid" />
    </UDropdown>
  </div>
</template>
