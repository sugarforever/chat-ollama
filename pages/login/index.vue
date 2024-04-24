<script setup lang="ts">
import { object, string, type InferType } from 'yup'

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
  name: string().min(1).required('Required'),
  password: string().min(8, 'Must be at least 8 characters').required('Required')
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
      title: 'Failed to log in',
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
        <h1 class="font-bold text-2xl text-center">Sign in</h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup label="Name" name="name">
          <UInput v-model="state.name" />
        </UFormGroup>

        <UFormGroup label="Password" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>

        <div class="flex justify-center">
          <UButton class="mt-4" type="submit" :loading="loading">
            Continue
          </UButton>
        </div>
      </UForm>
    </UCard>
  </ClientOnly>
</template>
