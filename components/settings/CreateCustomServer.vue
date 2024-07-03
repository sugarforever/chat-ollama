<script lang="ts" setup>
import { object, string } from 'yup'

const props = defineProps<{
  onClose?: () => void
  onCreate?: (name: string) => void
}>()

const { t } = useI18n()

const formData = reactive({
  name: '',
})

const schema = computed(() => {
  return object({
    name: string().required(t('global.required')),
  })
})

function onSubmit() {
  props.onCreate?.(formData.name)
}
</script>

<template>
  <UModal prevent-close>
    <UCard>
      <template #header>
        <h5>{{ t('settings.customApiService') }}</h5>
      </template>
      <UForm :state="formData" :schema="schema" @submit="onSubmit">
        <UFormGroup :label="t('settings.customApiServiceName')" name="name">
          <UInput v-model="formData.name" />
        </UFormGroup>
        <div class="flex justify-end gap-2 mt-4">
          <UButton color="gray" class="mr-2" @click="onClose">{{ t('global.cancel') }}</UButton>
          <UButton type="submit" color="primary">{{ t('global.create') }}</UButton>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
