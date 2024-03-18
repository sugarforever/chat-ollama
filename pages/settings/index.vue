<script setup>
import {
  ollamaHost,
  ollamaUsername,
  ollamaPassword,
  openAiApiKey,
  openAiApiHost,
  anthropicApiKey,
  anthropicApiHost,
} from '@/utils/settings';

const toast = useToast();

const state = reactive({
  ollamaHost: undefined,
  username: undefined,
  password: undefined,
  openaiApiKey: undefined,
  openaiApiHost: undefined,
  anthropicApiKey: undefined,
  anthropicApiHost: undefined,
});

const saving = ref(false);
const authorization = ref(false);

const validate = (state) => {
  const errors = [];

  errors.push(checkHost('host', 'Ollama host'))
  errors.push(checkHost('openaiApiHost', 'OpenAI host'))
  errors.push(checkHost('anthropicApiHost', 'Anthropic host'))

  return errors.filter(Boolean)
};

const onSubmit = async () => {
  ollamaHost.value = state.ollamaHost;
  ollamaUsername.value = state.username;
  ollamaPassword.value = state.password;
  openAiApiKey.value = state.openaiApiKey;
  openAiApiHost.value = state.openaiApiHost;
  anthropicApiKey.value = state.anthropicApiKey;
  anthropicApiHost.value = state.anthropicApiHost;

  toast.add({ title: `Set successfully!` });
};

onMounted(() => {
  state.ollamaHost = ollamaHost.value;
  state.username = ollamaUsername.value;
  state.password = ollamaPassword.value;
  state.openaiApiKey = openAiApiKey.value;
  state.openaiApiHost = openAiApiHost.value;
  state.anthropicApiKey = anthropicApiKey.value;
  state.anthropicApiHost = anthropicApiHost.value;

  authorization.value = !!(state.username && state.password);
});

function checkHost(path, name) {
  const url = state[path]
  if (!url) return null

  if (/^https?:\/\//i.test(url)) return null

  return { path, message: `${name} must start with http:// or https://` }
}

</script>

<template>
  <div class="w-[640px]">
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
      <UCard>
        <template #header>Ollama Server Setting</template>
        <UFormGroup label="Host" name="ollamaHost" class="mb-4">
          <UInput v-model.trim="state.ollamaHost" />
        </UFormGroup>
        <UCheckbox v-model="authorization" name="authorization" label="Authorization" class="mb-4" />
        <template v-if="authorization">
          <UFormGroup label="User Name" name="username" class="mb-4">
            <UInput v-model.trim="state.username" />
          </UFormGroup>
          <UFormGroup label="Password" name="password">
            <UInput v-model="state.password" type="password" />
          </UFormGroup>
        </template>
      </UCard>

      <UCard>
        <template #header>OpenAI</template>
        <UFormGroup label="Key" name="openaiApiKey" class="mb-4">
          <UInput v-model="state.openaiApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="openaiApiHost">
          <UInput v-model.trim="state.openaiApiHost" />
        </UFormGroup>
      </UCard>

      <UCard>
        <template #header>Anthropic</template>
        <UFormGroup label="Anthropic" name="anthropicApiKey" class="mb-4">
          <UInput v-model="state.anthropicApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="anthropicApiHost">
          <UInput v-model.trim="state.anthropicApiHost" />
        </UFormGroup>
      </UCard>

      <div class="text-center">
        <UButton type="submit" :loading="saving">
          Save
        </UButton>
      </div>
    </UForm>
  </div>
</template>
