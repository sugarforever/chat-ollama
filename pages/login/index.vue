<script setup lang="ts">
import { object, string } from 'yup'

definePageMeta({
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: '/'
  }
})

const { t } = useI18n()
const { signIn } = useAuth()
const toast = useToast()

const loading = ref(false)
const schema = object({
  name: string().min(1, t("auth.nameRule1")).required(t('global.required')),
  password: string().min(8, t('auth.passwordRule1')).required(t('global.required'))
})

const state = reactive({
  name: undefined,
  password: undefined
})

async function onSubmit() {
  loading.value = true
  try {
    await signIn({
      username: state.name,
      password: state.password
    }, {
      callbackUrl: '/'
    })
  } catch (error: any) {
    toast.add({
      title: t('auth.failedLoginTitle'),
      description: error?.statusMessage || error,
      color: 'red'
    })
  }
  loading.value = false
}
</script>
<template>
  <ClientOnly>
    <UCard class="w-[400px] mx-auto">
      <template #header>
        <h1 class="font-bold text-2xl text-center">{{ t("auth.signIn") }}</h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup :label="t('global.name')" name="name">
          <UInput v-model="state.name" />
        </UFormGroup>

        <UFormGroup :label="t('global.password')" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>

        <div class="pt-4">
          <UButton size="lg" class="block w-full" type="submit" :loading="loading">{{ t("global.continue") }}</UButton>
        </div>
        <div class="text-sm">
          <span>{{ t('auth.noAccount') }}</span>
          <UButton to="/signup" variant="link">{{ t('auth.signUp') }}</UButton>
        </div>
      </UForm>
    </UCard>
  </ClientOnly>
</template>
