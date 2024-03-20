<script setup>
import {
  ollamaHost,
  ollamaUsername,
  ollamaPassword,
  openAiApiKey,
  openAiApiHost,
  azureOpenaiApiKey,
  azureOpenaiEndpoint,
  azureOpenaiDeploymentName,
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

  azureOpenaiApiKey: undefined,
  azureOpenaiEndpoint: undefined,
  azureOpenaiDeploymentName: undefined,

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

  azureOpenaiApiKey.value = state.azureOpenaiApiKey;
  azureOpenaiEndpoint.value = state.azureOpenaiEndpoint;
  azureOpenaiDeploymentName.value = state.azureOpenaiDeploymentName;

  anthropicApiKey.value = state.anthropicApiKey;
  anthropicApiHost.value = state.anthropicApiHost;

  toast.add({ title: `Set successfully!` });
};

onMounted(() => {
  // Ollama
  state.ollamaHost = ollamaHost.value;
  state.username = ollamaUsername.value;
  state.password = ollamaPassword.value;

  // OpenAI
  state.openaiApiKey = openAiApiKey.value;
  state.openaiApiHost = openAiApiHost.value;

  // Azure OpenAI
  state.azureOpenaiApiKey = azureOpenaiApiKey.value;
  state.azureOpenaiEndpoint = azureOpenaiEndpoint.value;
  state.azureOpenaiDeploymentName = azureOpenaiDeploymentName.value;

  // Anthropic
  state.anthropicApiKey = anthropicApiKey.value;
  state.anthropicApiHost = anthropicApiHost.value;

  authorization.value = !!(state.username && state.password);
});

const checkHost = (path, name) => {
  const url = state[path]
  if (!url) return null

  if (/^https?:\/\//i.test(url)) return null

  return { path, message: `${name} must start with http:// or https://` }
}

const ui = {
  header: {
    base: 'font-bold',
    background: '',
    padding: 'px-4 py-3 sm:px-6',
  }
}
</script>

<template>
  <div class="w-[640px] mx-auto">
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
      <UCard :ui="ui">
        <template #header>Ollama Server Setting</template>
        <UFormGroup label="Host" name="ollamaHost" class="mb-4">
          <UInput v-model.trim="state.ollamaHost" />
        </UFormGroup>
        <ClientOnly>
          <UCheckbox v-model="authorization" name="authorization" label="Authorization" class="mb-4" />
        </ClientOnly>
        <template v-if="authorization">
          <UFormGroup label="User Name" name="username" class="mb-4">
            <UInput v-model.trim="state.username" />
          </UFormGroup>
          <UFormGroup label="Password" name="password">
            <UInput v-model="state.password" type="password" />
          </UFormGroup>
        </template>
      </UCard>

      <UCard :ui="ui">
        <template #header>OpenAI</template>
        <UFormGroup label="API Key" name="openaiApiKey" class="mb-4">
          <UInput v-model="state.openaiApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="openaiApiHost">
          <UInput v-model.trim="state.openaiApiHost" />
        </UFormGroup>
      </UCard>

      <UCard :ui="ui">
        <template #header>Azure OpenAI</template>
        <UFormGroup label="API Key" name="azureOpenaiApiKey" class="mb-4">
          <UInput v-model="state.azureOpenaiApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Endpoint" name="azureOpenaiEndpoint" class="mb-4">
          <UInput v-model="state.azureOpenaiEndpoint" />
        </UFormGroup>
        <UFormGroup label="Deployment Name" name="azureOpenaiDeploymentName" class="mb-4">
          <UInput v-model="state.azureOpenaiDeploymentName" />
        </UFormGroup>
      </UCard>

      <UCard :ui="ui">
        <template #header>Anthropic</template>
        <UFormGroup label="API Key" name="anthropicApiKey" class="mb-4">
          <UInput v-model="state.anthropicApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="anthropicApiHost">
          <UInput v-model.trim="state.anthropicApiHost" />
        </UFormGroup>
      </UCard>

      <div class="">
        <UButton type="submit" :loading="saving">
          Save
        </UButton>
      </div>
    </UForm>
  </div>
</template>
