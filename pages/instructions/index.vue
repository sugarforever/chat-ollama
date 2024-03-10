<script setup>
import { loadOllamaInstructions } from "@/utils/settings";

const instructions = ref([]);
const isOpen = ref(false);

const loading = ref(false);
const tableRows = computed(() => {
  return instructions.value?.map((instruction) => {
    return {
      id: instruction.id,
      name: instruction.name,
      instruction: instruction.instruction,
    };
  }) ?? [];
});

const state = reactive({
  id: undefined,
  name: undefined,
  instruction: undefined,
});

watch(isOpen, (val) => {
  if (!val) {
    setTimeout(() => {
      state.id = undefined;
      state.name = undefined;
      state.instruction = undefined;
    }, 300)
  }
});

const validate = (state) => {
  const errors = [];
  if (!state.name) errors.push({ path: "name", message: "Required" });
  if (!state.instruction)
    errors.push({ path: "instruction", message: "Required" });
  return errors;
};

async function createInstruction(name, instruction) {
  const body = JSON.stringify({
    name,
    instruction,
  });
  try {
    const result = await $fetch(`/api/instruction/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
    return result;
  } catch (e) {
    console.error("Failed to create Ollama instruction", e);
  }
};

async function onSubmit() {
  loading.value = true;
  if (state.id) {
    await editInstruction(state.id, state.name, state.instruction)
  } else {
    await createInstruction(state.name, state.instruction);
  }
  loading.value = false;
  isOpen.value = false;
  await loadInstructions();
}

const loadInstructions = async () => {
  instructions.value = await loadOllamaInstructions();
};

onMounted(async () => {
  await loadInstructions();
});

const ui = {
  td: {
    base: "whitespace-break-spaces",
  },
};

const columns = [
  {
    label: "Name",
    key: "name",
  },
  {
    label: "Instruction",
    key: "instruction",
  },
  {
    key: "actions",
  },
];

const actionsItems = (row) => {
  return [
    [
      {
        label: "Edit",
        icon: "i-heroicons-pencil-square-20-solid",
        click: () => onEdit(row),
      },
      {
        label: "Delete",
        icon: "i-heroicons-trash-20-solid",
        click: () => onDelete(row.id),
      },
    ],
  ];
};

async function editInstruction(id, name, instruction) {
  const body = JSON.stringify({
    name,
    instruction,
  });
  try {
    const result = await $fetch(`/api/instruction/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
    return result;
  } catch (e) {
    console.error("Failed to edit Ollama instruction", e);
  }
};

const onEdit = async ({ id, name, instruction }) => {
  state.id = id;
  state.name = name;
  state.instruction = instruction;

  isOpen.value = true;
};

const onDelete = async (id) => {
  try {
    await $fetch(`/api/instruction/${id}`, {
      method: "DELETE",
    });
    await loadInstructions();
  } catch (e) {
    console.error("Failed to delete Ollama instruction", e);
  }
};

</script>
<template>
  <div class="w-full">
    <UButton class="my-4" @click="isOpen = true">
      Create New Instruction
    </UButton>
    <UTable :rows="tableRows" :columns :ui class="w-full">
      <template #actions-data="{ row }">
        <UDropdown :items="actionsItems(row)">
          <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
        </UDropdown>
      </template>
    </UTable>
    <UModal v-model="isOpen">
      <div class="p-4">
        <h1 class="font-bold my-4">{{ state.id ? 'Edit Instruction' : 'Create New Instruction' }}</h1>
        <UForm :validate="validate" :state class="space-y-4" @submit="onSubmit">
          <UFormGroup label="Name" name="name">
            <UInput v-model="state.name" />
          </UFormGroup>

          <UFormGroup label="Instruction" name="instruction">
            <UTextarea v-model="state.instruction" autoresize :rows="3" />
          </UFormGroup>

          <UButton type="submit" :loading> Save </UButton>
        </UForm>
      </div>
    </UModal>
  </div>
</template>
