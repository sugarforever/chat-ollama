<script setup lang="ts">
import { object, string, type InferType } from 'yup'
import { useI18n } from "vue-i18n"
const { t } = useI18n()

definePageMeta({
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: '/'
  }
})
const { signIn } = useAuth()
const loading = ref(false)
const toast = useToast()

const schema = object({
  name: string().min(1, t("name must be at least 1 characters")).required(t('Required')),
  password: string().min(8, t('Must be at least 8 characters')).required(t('Required'))
})

type Schema = InferType<typeof schema>

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
      title: t('Failed to log in'),
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
        <h1 class="font-bold text-2xl text-center">{{ t("Sign in") }}</h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup :label="t('Name')" name="name">
          <UInput v-model="state.name" />
        </UFormGroup>

        <UFormGroup :label="t('Password')" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>

        <div class="pt-4">
          <UButton size="lg" class="block w-full" type="submit" :loading="loading">{{ t("Continue") }}</UButton>
        </div>
        <div class="text-sm">
          <span>No account? </span>
          <UButton to="/signup" variant="link">Sign up</UButton>
        </div>
      </UForm>
    </UCard>
  </ClientOnly>
</template>
