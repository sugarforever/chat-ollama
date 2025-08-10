<script setup lang="ts">
import { object, string } from 'yup'

definePageMeta({
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: '/'
  }
})

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)
const schema = object({
  name: string().required(t('global.required')),
  password: string().required(t('global.required')),
})

const state = reactive({
  name: '',
  password: '',
})

async function onSubmit() {
  loading.value = true
  try {
    console.log('Login attempt with:', { name: state.name, password: state.password ? '[REDACTED]' : 'empty' })
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        name: state.name,
        password: state.password
      }
    })

    toast.add({
      title: 'Success',
      description: 'Signed in successfully!',
      color: 'green'
    })

    // Do a full page reload to refresh auth state
    window.location.href = '/'
  } catch (error: any) {
    toast.add({
      title: t('auth.failedLoginTitle'),
      description: error.data?.statusMessage || 'Failed to sign in',
      color: 'red'
    })
  } finally {
    loading.value = false
  }
}

async function signInWithGoogle() {
  loading.value = true
  try {
    await navigateTo('/api/auth/google/login', { external: true })
  } catch (error: any) {
    toast.add({
      title: t('auth.failedLoginTitle'),
      description: 'Failed to sign in with Google',
      color: 'red'
    })
    loading.value = false
  }
}
</script>
<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo and branding -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome back</h1>
        <p class="text-gray-600 dark:text-gray-400">Sign in to start your next chat</p>
      </div>

      <!-- Sign-in card -->
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
        <div class="space-y-6">
          <!-- Login form -->
          <UForm :schema="schema" :state="state" @submit="onSubmit" class="space-y-4">
            <!-- Name field -->
            <UFormGroup name="name">
              <UInput
                      v-model="state.name"
                      type="text"
                      placeholder="Username"
                      size="lg"
                      :disabled="loading" />
            </UFormGroup>

            <!-- Password field -->
            <UFormGroup name="password">
              <UInput
                      v-model="state.password"
                      type="password"
                      placeholder="Password"
                      size="lg"
                      :disabled="loading" />
            </UFormGroup>

            <!-- Submit button -->
            <UButton
                     type="submit"
                     size="lg"
                     class="justify-center w-full"
                     :loading="loading"
                     :disabled="loading">
              Log In
            </UButton>
          </UForm>

          <!-- Divider -->
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">OR</span>
            </div>
          </div>

          <!-- Google sign-in -->
          <UButton
                   size="lg"
                   variant="outline"
                   class="w-full border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                   @click="signInWithGoogle"
                   :disabled="loading">
            <template #leading>
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </template>
            Continue with Google
          </UButton>

          <!-- GitHub (disabled) -->
          <UButton
                   size="lg"
                   variant="outline"
                   class="w-full border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                   disabled>
            <template #leading>
              <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </template>
            <span class="text-gray-400">Continue with GitHub</span>
            <span class="text-xs text-gray-400 ml-1">(Coming soon)</span>
          </UButton>

          <!-- Apple (disabled) -->
          <UButton
                   size="lg"
                   variant="outline"
                   class="w-full border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                   disabled>
            <template #leading>
              <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
              </svg>
            </template>
            <span class="text-gray-400">Continue with Apple</span>
            <span class="text-xs text-gray-400 ml-1">(Coming soon)</span>
          </UButton>
        </div>

        <!-- Sign up link -->
        <div class="mt-8 text-center">
          <span class="text-sm text-gray-600 dark:text-gray-400">Don't have an account? </span>
          <UButton to="/signup" variant="link" class="text-sm p-0">Sign up</UButton>
        </div>
      </div>

      <!-- Footer links -->
      <div class="mt-8 text-center space-x-4">
        <a href="#" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">Terms of Service</a>
        <span class="text-gray-300 dark:text-gray-600">and</span>
        <a href="#" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">Privacy Policy</a>
      </div>
    </div>
  </div>
</template>
