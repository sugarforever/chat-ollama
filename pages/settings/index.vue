<script setup>
import {
  ollamaHost,
  ollamaUsername,
  ollamaPassword,
  openAiApiKey,
  anthropicApiKey,
} from '@/utils/settings';

const toast = useToast();

const state = reactive({
  host: undefined,
  username: undefined,
  password: undefined,
  openaiApiKey: undefined,
  anthropicApiKey: undefined
});

const saving = ref(false);
const authorization = ref(false);

const validate = (state) => {
  const errors = [];

  if (!/^https?:\/\//i.test(state.host.trim())) {
    errors.push({ path: 'host', message: 'Host must start with http:// or https://' });
  }

  return errors
};

const onSubmit = async () => {
  console.log("Submitting: ", state.host.trim());
  ollamaHost.value = state.host.trim();
  ollamaUsername.value = state.username;
  ollamaPassword.value = state.password;
  openAiApiKey.value = state.openaiApiKey;
  anthropicApiKey.value = state.anthropicApiKey;

  toast.add({ title: `Ollama server set to ${state.host.trim()} successfully!` });
};

onMounted(() => {
  state.host = ollamaHost.value;
  state.username = ollamaUsername.value;
  state.password = ollamaPassword.value;
  state.openaiApiKey = openAiApiKey.value;
  state.anthropicApiKey = anthropicApiKey.value;

  authorization.value = !!(state.username && state.password);
});

</script>

<template>
  <div class="w-[640px]">
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
      <Heading label="Ollama Server Setting" />
      <UFormGroup label="Host" name="host">
        <UInput v-model="state.host" />
      </UFormGroup>

      <UFormGroup>
        <UCheckbox v-model="authorization" name="authorization" label="Authorization" class="mb-4" />
        <UFormGroup label="User Name" name="username" v-if="authorization" class="mb-2">
          <UInput v-model="state.username" />
        </UFormGroup>

        <UFormGroup label="Password" name="password" v-if="authorization">
          <UInput v-model="state.password" type="password" />
        </UFormGroup>
      </UFormGroup>

      <Heading label="API Keys" class="pt-4" />

      <UFormGroup>
        <UFormGroup label="OpenAI" name="openai" class="mb-2">
          <UInput v-model="state.openaiApiKey" type="password" />
        </UFormGroup>

        <UFormGroup label="Anthropic" name="anthropic">
          <UInput v-model="state.anthropicApiKey" type="password" />
        </UFormGroup>
      </UFormGroup>

      <UButton type="submit" :loading="saving">
        Save
      </UButton>
    </UForm>
  </div>
</template>
