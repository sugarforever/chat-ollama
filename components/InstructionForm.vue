<script lang="ts" setup>
import type { Instruction } from '@prisma/client'

const props = defineProps<{
  title: string
  type: 'create' | 'update'
  data?: Instruction
  onSuccess: () => void
  onClose: () => void
}>()

const { t } = useI18n()
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
    errors.push({ path: "name", message: t("global.required") })
  if (!data.instruction)
    errors.push({ path: "instruction", message: t("global.required") })
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
          title: t('global.error'),
          description: ` ${isModify.value ? t('instructions.editFailed') : t('instructions.createFailed')}`,
          color: 'red',
        })
      }
    })
  } catch (e: any) {
    toast.add({ title: t('global.error'), description: e.message, color: 'red' })
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
        <UFormGroup :label="t('global.name')" name="name" class="mb-4">
          <UInput v-model="state.name" autocomplete="off" />
        </UFormGroup>

        <UFormGroup :label="t('instructions.instruction')" name="instruction" class="mb-4">
          <UTextarea v-model="state.instruction" autoresize :rows="3" :maxrows="8" />
        </UFormGroup>

        <div class="text-right">
          <UButton color="gray" class="mr-2" @click="onClose()">{{ t("global.cancel") }}</UButton>
          <UButton type="submit" :loading>{{ t("global.save") }}</UButton>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
