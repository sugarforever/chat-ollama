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
  host: undefined,
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

  const host = state.host.trim();
  if (host.length !== 0 && !/^https?:\/\//i.test(host)) {
    errors.push({ path: 'host', message: 'Host must start with http:// or https://' });
  }

  return errors
};

const onSubmit = async () => {
  console.log("Submitting: ", state.host.trim());

  if (!checkHost(state.host, 'Ollama host')) return
  if (!checkHost(state.openaiApiHost, 'OpenAI host')) return
  if (!checkHost(state.anthropicApiHost, 'Anthropic host')) return

  const host = state.host.trim();
  ollamaHost.value = host.length > 0 ? host : null;
  ollamaUsername.value = state.username;
  ollamaPassword.value = state.password;
  openAiApiKey.value = state.openaiApiKey;
  openAiApiHost.value = state.openaiApiHost;
  anthropicApiKey.value = state.anthropicApiKey;
  anthropicApiHost.value = state.anthropicApiHost;

  toast.add({ title: `Ollama server set to ${state.host.trim()} successfully!` });
};

onMounted(() => {
  state.host = ollamaHost.value;
  state.username = ollamaUsername.value;
  state.password = ollamaPassword.value;
  state.openaiApiKey = openAiApiKey.value;
  state.openaiApiHost = openAiApiHost.value;
  state.anthropicApiKey = anthropicApiKey.value;
  state.anthropicApiHost = anthropicApiHost.value;

  authorization.value = !!(state.username && state.password);
});

function checkHost(url, name) {
  if (!url) return true

  if (/^https?:\/\//i.test(url)) return true

  toast.add({
    id: name,
    title: 'Invalid host',
    description: `${name} must start with http:// or https://`,
    status: 'error',
    color: 'red',
    duration: 3000,
    isClosable: true,
  })

  return false
}

</script>

<template>
  <div class="w-[640px]">
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
      <UCard>
        <template #header>Ollama Server Setting</template>
        <UFormGroup label="Host" name="host" class="mb-4">
          <UInput v-model.trim="state.host" />
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
        <UFormGroup label="Key" name="openAiKey" class="mb-4">
          <UInput v-model="state.openaiApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="openAiHost">
          <UInput v-model.trim="state.openaiApiHost" />
        </UFormGroup>
      </UCard>

      <UCard>
        <template #header>Anthropic</template>
        <UFormGroup label="Anthropic" name="anthropic" class="mb-4">
          <UInput v-model="state.anthropicApiKey" type="password" />
        </UFormGroup>
        <UFormGroup label="Custom API host" name="anthropicHost">
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
