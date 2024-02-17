<script setup>
import { ref } from 'vue';

const model = ref(null);
const onModelChanged = (newModel) => {
  model.value = newModel;
  console.log("Model: ", model.value);
}
</script>

<template>
  <div class="flex flex-col w-full">
    <ClientOnly>
      <models @model-changed="onModelChanged" />
    </ClientOnly>
  </div>
</template>
