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
  <ClientOnly>
    <div>
      <UButton
               icon="i-heroicons-user-circle-16-solid"
               to="/login"
               variant="outline"
               v-if="status === 'unauthenticated'">Log In</UButton>
      <div v-else>
        <UDropdown :items="items" :popper="{ placement: 'bottom-end' }">
          <UButton :color="buttonColor" :label="data?.name" trailing-icon="i-heroicons-chevron-down-20-solid" />
        </UDropdown>
      </div>
    </div>
  </ClientOnly>
</template>
