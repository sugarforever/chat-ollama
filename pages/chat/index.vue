<script setup>
import { ref } from 'vue';

const model = ref(null);
const onModelChanged = (newModel) => {
  model.value = newModel;
  console.log("Model: ", model.value);
}
</script>

<template>
  <div class="h-full flex flex-1">
    <chat :model="model" />
  </div>
</template>
