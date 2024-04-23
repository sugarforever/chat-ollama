<script setup lang="ts">
import { object, string, ref as yupRef, type InferType } from 'yup'

definePageMeta({
  auth: {
    unauthenticatedOnly: true
  }
})

const toast = useToast()
const loading = ref(false)

const schema = object({
  name: string().min(1).required('Required'),
  email: string().email('Invalid email'),
  password: string()
    .min(8, 'Must be at least 8 characters')
    .required('Required'),
  confirmedPassword: string()
    .oneOf([yupRef('password'), null], 'Passwords must match')
})

type Schema = InferType<typeof schema>

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
          title: 'Error',
          description: `Failed to sign up. Please try again later.`,
          color: 'red',
        })
      }
    })
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.statusMessage, color: 'red' })
  }
  loading.value = false
}
</script>
<template>
  <ClientOnly>
    <UCard class="w-[400px] mx-auto">
      <template #header>
        <h1 class="font-bold text-2xl text-center">Create your account</h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup label="Name" name="name">
          <UInput v-model="state.name" />
        </UFormGroup>

        <UFormGroup label="Email" name="email">
          <UInput v-model="state.email" />
        </UFormGroup>

        <UFormGroup label="Password" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>

        <UFormGroup label="Confirmed Password" name="confirmedPassword">
          <UInput v-model="state.confirmedPassword" type="password" />
        </UFormGroup>

        <div class="flex justify-center">
          <UButton class="mt-4" type="submit" :loading="loading">
            Sign Up
          </UButton>
        </div>
      </UForm>
    </UCard>
  </ClientOnly>
</template>
