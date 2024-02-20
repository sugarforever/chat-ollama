<script setup>

import { loadOllamaInstructions, saveOllamaInstruction } from '@/utils/settings';

const instructions = ref([]);
const isOpen = ref(false);
const loading = ref(false);
const tableRows = computed(() => {
  return instructions.value.map((instruction) => {
    return {
      name: instruction.name,
      instruction: instruction.instruction,
    }
  });
});

const state = reactive({
  name: undefined,
  instruction: undefined
})

const validate = (state) => {
  const errors = []
  if (!state.name) errors.push({ path: 'name', message: 'Required' })
  if (!state.instruction) errors.push({ path: 'instruction', message: 'Required' })
  return errors
}

async function onSubmit() {
  loading.value = true;
  saveOllamaInstruction(state.name, state.instruction);
  loading.value = false;
  isOpen.value = false;
  loadInstructions();
}

const loadInstructions = () => {
  instructions.value = loadOllamaInstructions();
}

onMounted(() => {
  loadInstructions();
});

const ui = {
  td: {
    base: 'whitespace-break-spaces'
  }
}
</script>
<template>
  <div class="w-full">
    <UButton class="my-4" @click="isOpen = true">Create New Instruction</UButton>
    <UTable :rows="tableRows" :ui="ui" class="w-full" />
    <UModal v-model="isOpen">
      <div class="p-4">
        <h1 class="font-bold my-4">Create a new instruction</h1>
        <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
          <UFormGroup label="Name" name="name">
            <UInput v-model="state.name" />
          </UFormGroup>

          <UFormGroup label="Instruction" name="instruction">
            <UTextarea v-model="state.instruction" autoresize :rows="3" />
          </UFormGroup>

          <UButton type="submit" :loading="loading">
            Save
          </UButton>
        </UForm>
      </div>
    </UModal>
  </div>
</template>
