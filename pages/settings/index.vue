<script setup>
import {
  loadKey,
  saveKey,
  loadOllamaHost,
  saveOllamaHost,
  loadOllamaUserName,
  saveOllamaUserName,
  loadOllamaPassword,
  saveOllamaPassword,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY
} from '@/utils/settings';

const toast = useToast();

const save = (host, authorization, username, password) => {
  saving.value = true;
  saveOllamaHost(host);
  saveOllamaUserName(authorization ? username : null);
  saveOllamaPassword(authorization ? password : null);
  saving.value = false;
}

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
  save(state.host.trim(), authorization.value, state.username, state.password);
  saveKey(OPENAI_API_KEY, state.openaiApiKey);
  saveKey(ANTHROPIC_API_KEY, state.anthropicApiKey);
  toast.add({ title: `Ollama server set to ${state.host.trim()} successfully!` });
};

onMounted(() => {
  state.host = loadOllamaHost();
  state.username = loadOllamaUserName();
  state.password = loadOllamaPassword();
  state.openaiApiKey = loadKey(OPENAI_API_KEY);
  state.anthropicApiKey = loadKey(ANTHROPIC_API_KEY);

  if (state.username && state.password) {
    authorization.value = true;
  } else {
    authorization.value = false;
  }
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
