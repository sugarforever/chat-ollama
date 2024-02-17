<script setup>
import { loadOllamaHost, saveOllamaHost } from '../../utils/settings';

const toast = useToast();

const load = () => {
  return loadOllamaHost();
}

const save = (host) => {
  saving.value = true;
  saveOllamaHost(host);
  saving.value = false;
}

const state = reactive({
  host: undefined
});
const saving = ref(false);

const validate = (state) => {
  const errors = [];

  if (!/^https?:\/\//i.test(state.host)) {
    errors.push({ path: 'host', message: 'Host must start with http:// or https://' });
  }

  return errors
};

const onSubmit = () => {
  console.log("Submitting: ", state.host);
  save(state.host);
  toast.add({ title: `Ollama server set to ${state.host} successfully!` });
};

onMounted(() => {
  state.host = load();
});

</script>

<template>
  <div class="w-96">
    <Heading label="Ollama Server Setting" />
    <UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormGroup label="Host" name="host">
        <UInput v-model="state.host" />
      </UFormGroup>

      <UButton type="submit" :loading="saving">
        Save
      </UButton>
    </UForm>
  </div>
</template>
