<script setup lang="ts">
import {useI18n} from "vue-i18n";
const { t } = useI18n()

const { signOut } = useAuth()
</script>
<template>
  <ClientOnly>
    <div>
      <p>Sign Out</p>
      <button @click="signOut()">{{ t("auth.Sign Out") }}</button>
    </div>
  </ClientOnly>
</template>
