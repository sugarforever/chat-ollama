<script lang="ts" setup>
import type { Instruction } from '@prisma/client'

const props = defineProps<{
  title: string
  type: 'create' | 'update'
  data?: Instruction
  onSuccess: () => void
  onClose: () => void
}>()

const toast = useToast()

const state = reactive({
  name: props.data?.name || '',
  instruction: props.data?.instruction || '',
})
const loading = ref(false)
const isModify = computed(() => props.type === 'update')

const validate = (data: typeof state) => {
  const errors = []
  if (!data.name)
    errors.push({ path: "name", message: "Required" })
  if (!data.instruction)
    errors.push({ path: "instruction", message: "Required" })
  return errors
}

async function onSubmit() {
  if (loading.value) return

  const data = isModify.value ? { ...state, id: props.data?.id } : state
  await submit(data)
}

async function submit(data: typeof state & { id?: number }) {
  loading.value = true
  try {
    await $fetchWithAuth(
      isModify.value ? `/api/instruction/${data.id}` : '/api/instruction',
      {
        method: isModify.value ? 'PUT' : 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    ).then(res => {
      if (res) {
        props.onSuccess()
        props.onClose()
      } else {
        toast.add({
          title: 'Error',
          description: `Failed to ${isModify.value ? 'edit' : 'create'} instruction`,
          color: 'red',
        })
      }
    })
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'red' })
  }
  loading.value = false
}
</script>

<template>
  <UModal prevent-close>
    <UCard>
      <template #header>
        <div class="flex items-center">
          <span class="mr-auto">{{ title }}</span>
          <UButton icon="i-material-symbols-close-rounded" color="gray" @click="onClose()"></UButton>
        </div>
      </template>

      <UForm :validate="validate" :state="state" @submit="onSubmit">
        <UFormGroup label="Name" name="name" class="mb-4">
          <UInput v-model="state.name" autocomplete="off" />
        </UFormGroup>

        <UFormGroup label="Instruction" name="instruction" class="mb-4">
          <UTextarea v-model="state.instruction" autoresize :rows="3" :maxrows="8" />
        </UFormGroup>

        <div class="text-right">
          <UButton color="gray" class="mr-2" @click="onClose()">Cancel</UButton>
          <UButton type="submit" :loading>Save</UButton>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
