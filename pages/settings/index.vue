<script setup>
import {
  loadOllamaHost,
  saveOllamaHost,
  loadOllamaUserName,
  saveOllamaUserName,
  loadOllamaPassword,
  saveOllamaPassword
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
  password: undefined
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
  toast.add({ title: `Ollama server set to ${state.host.trim()} successfully!` });
};

onMounted(() => {
  state.host = loadOllamaHost();
  state.username = loadOllamaUserName();
  state.password = loadOllamaPassword();

  if (state.username && state.password) {
    authorization.value = true;
  } else {
    authorization.value = false;
  }
});

</script>

<template>
  <div class="w-[640px]">
    <Heading label="Ollama Server Setting" />
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
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
      
      <UButton type="submit" :loading="saving">
        Save
      </UButton>
    </UForm>
  </div>
</template>
