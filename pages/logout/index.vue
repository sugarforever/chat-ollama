<script setup lang="ts">
const { signOut } = useAuth()
</script>
<template>
  <ClientOnly>
    <div>
      <p>Sign Out</p>
      <button @click="signOut()">Sign Out</button>
    </div>
  </ClientOnly>
</template>
