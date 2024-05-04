<script setup lang="ts">
import { object, string, ref as yupRef } from 'yup'

definePageMeta({
  auth: {
    unauthenticatedOnly: true
  }
})

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)

const schema = object({
  name: string().min(1).required(t('global.required')),
  email: string().email(t('auth.emailRule1')),
  password: string()
    .min(8, t('auth.passwordRule1'))
    .required(t('global.required')),
  confirmedPassword: string()
    .oneOf([yupRef('password'), null as any], t('auth.passwordRule2'))
})

const state = reactive({
  name: undefined,
  email: undefined,
  password: undefined,
  confirmedPassword: undefined
})

async function onSubmit() {
  loading.value = true
  try {
    await $fetch('/api/auth/signup',
      {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: state.name,
          email: state.email,
          password: state.password
        }),
      }
    ).then(res => {
      if (res) {
        navigateTo("/")
      } else {
        toast.add({
          title: t('global.error'),
          description: t("auth.signUpFailed"),
          color: 'red',
        })
      }
    })
  } catch (e: any) {
    toast.add({ title: t('global.error'), description: e.statusMessage, color: 'red' })
  }
  loading.value = false
}
</script>
<template>
  <ClientOnly>
    <UCard class="w-[400px] mx-auto">
      <template #header>
        <h1 class="font-bold text-2xl text-center">{{ t("auth.createAccount") }}</h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup :label="t('global.name')" name="name">
          <UInput v-model="state.name" />
        </UFormGroup>

        <UFormGroup :label="t('auth.email')" name="email">
          <UInput v-model="state.email" />
        </UFormGroup>

        <UFormGroup :label="t('global.password')" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>

        <UFormGroup :label="t('auth.confirmPassword')" name="confirmedPassword">
          <UInput v-model="state.confirmedPassword" type="password" />
        </UFormGroup>

        <div class="pt-4">
          <UButton class="block w-full" size="lg" type="submit" :loading="loading">
            {{ t('auth.signUp') }}
          </UButton>
        </div>
        <div class="text-sm">
          <span>{{ t('auth.haveAnAccount') }}</span>
          <UButton to="/login" variant="link">{{ t('auth.signIn') }}</UButton>
        </div>
      </UForm>
    </UCard>
  </ClientOnly>
</template>
