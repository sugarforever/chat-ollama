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

  moonshotApiKey,
  moonshotApiHost,

  geminiApiKey,

  groqApiKey,
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

  moonshotApiKey: undefined,
  moonshotApiHost: undefined,

  geminiApiKey: undefined,

  groqApiKey: undefined,
});

const saving = ref(false);
const authorization = ref(false);

const validate = (state) => {
  const errors = [];

  errors.push(checkHost('ollamaHost', 'Ollama host'))
  errors.push(checkHost('openaiApiHost', 'OpenAI host'))
  errors.push(checkHost('anthropicApiHost', 'Anthropic host'))
  errors.push(checkHost('moonshotApiHost', 'Moonshot host'))

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

  moonshotApiKey.value = state.moonshotApiKey;
  moonshotApiHost.value = state.moonshotApiHost;

  geminiApiKey.value = state.geminiApiKey;

  groqApiKey.value = state.groqApiKey;

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

  // Moonshot
  state.moonshotApiKey = moonshotApiKey.value;
  state.moonshotApiHost = moonshotApiHost.value;

  // Gemini
  state.geminiApiKey = geminiApiKey.value;

  // Groq
  state.groqApiKey = groqApiKey.value;

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

      <UCard :ui="ui">
        <template #header>Moonshot</template>
        <UFormGroup label="API Key" name="moonshotApiKey" class="mb-4">
          <UInput v-model="state.moonshotApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="moonshotApiHost">
          <UInput v-model.trim="state.moonshotApiHost" />
        </UFormGroup>
      </UCard>

      <UCard :ui="ui">
        <template #header>Gemini</template>
        <UFormGroup label="API Key" name="geminiApiKey" class="mb-4">
          <UInput v-model="state.geminiApiKey" type="password" />
        </UFormGroup>
      </UCard>

      <UCard :ui="ui">
        <template #header>Groq</template>
        <UFormGroup label="API Key" name="groqApiKey" class="mb-4">
          <UInput v-model="state.groqApiKey" type="password" />
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
