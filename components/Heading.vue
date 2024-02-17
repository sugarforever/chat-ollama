<script setup>
const { label } = defineProps({
  label: String
})
</script>
<template>
  <div class="font-bold text-xl my-4">{{ label }}</div>
</template>
