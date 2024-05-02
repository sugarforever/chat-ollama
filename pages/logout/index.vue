<script setup lang="ts">
const { t } = useI18n()

const { signOut } = useAuth()
</script>
<template>
  <ClientOnly>
    <div>
      <p>{{ t('auth.signOut') }}</p>
      <button @click="signOut()">{{ t("auth.signOut") }}</button>
    </div>
  </ClientOnly>
</template>
