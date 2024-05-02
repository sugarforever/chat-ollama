<script setup lang="ts">
const { signOut, data, status } = useAuth()
const onClickSignOut = async () => {
  await signOut({ callbackUrl: '/' })
}

const items = [
  [{
    label: 'Sign Out',
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
  <UButton v-if="status === 'unauthenticated'" label="Sign in" to="/login" color="white"></UButton>
  <div v-else>
    <UDropdown :items="items" :popper="{ placement: 'bottom-end' }">
      <UButton :color="buttonColor" :label="data?.name" trailing-icon="i-heroicons-chevron-down-20-solid" />
    </UDropdown>
  </div>
</template>
