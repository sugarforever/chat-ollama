<script setup lang="ts">
import {useI18n} from "vue-i18n";
const { t } = useI18n()

const { signOut, data, status } = useAuth()
const onClickSignOut = async () => {
  await signOut({ callbackUrl: '/' })
}

const items = [
  [{
    label: t('Sign Out'),
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
      <div v-if="status === 'unauthenticated'">
        <ULink
               to="/login"
               class="hover:underline text-sm"
               active-class="text-primary"
               inactive-class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {{ t("Sign In") }}
        </ULink>
        <span class="mx-1">/</span>
        <ULink
               to="/signup"
               class="hover:underline text-sm"
               active-class="text-primary"
               inactive-class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {{ t("Sign Up") }}
        </ULink>
      </div>
      <div v-else>
        <UDropdown :items="items" :popper="{ placement: 'bottom-end' }">
          <UButton :color="buttonColor" :label="data?.name" trailing-icon="i-heroicons-chevron-down-20-solid" />
        </UDropdown>
      </div>
    </div>
  </ClientOnly>
</template>
