<script setup>

import { Ollama } from 'ollama';
import { loadOllamaHost } from '../utils/settings';

const ollamaHost = ref(null);
const ollama = ref(null);

const model = ref(null);
const messages = ref([]);
const sending = ref(false);
const state = reactive({
  instruction: "",
  input: ""
})

watch(model, async (newModel) => {
  messages.value = [];
})

const onSend = async () => {
  if (sending.value || !state.input?.trim() || !model.value || !ollama.value) {
    return;
  }

  console.log("Sending message: ", state.input);
  sending.value = true;

  const { input } = state;
  rows.value = 1;
  setTimeout(() => {
    state.input = "";
  }, 50);
  messages.value.push({
    role: "user",
    content: input
  });

  const response = await ollama.value.chat({ model: model.value, messages: [...messages.value], stream: true });

  for await (const chunk of response) {
    const content = chunk?.message?.content;
    if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
      messages.value[messages.value.length - 1].content += content;
    } else {
      messages.value.push({ role: 'assistant', content });
    }
  }

  sending.value = false;
}

const onModelSelected = (modelName) => {
  model.value = modelName;
}

const rows = ref(1);

watch(ollamaHost, async (newHost) => {
  if (newHost) {
    console.log("Switching Ollama host: ", newHost);
    ollama.value = new Ollama({ host: newHost });
  }
});

onMounted(() => {
  ollamaHost.value = loadOllamaHost();
});

</script>
<template>
  <div class="flex flex-col flex-1 p-4">
    <div class="flex flex-row items-center justify-between mb-4 pb-4 border-b border-b-gray-200">
      <div class="flex flex-row" v-if="model">
        <span>Chat with</span>
        <h1 class="font-bold pl-1">{{ model }}</h1>
      </div>
      <ModelsDropdown @modelSelected="onModelSelected" />
    </div>
    <div dir="ltr" class="relative overflow-y-scroll flex-1 space-y-4">
      <ul className="flex flex-1 flex-col">
        <li v-for="(message, index) in messages" :key="index">
          <div
            :class="`${message.role == 'assistant' ? 'bg-white' : 'bg-primary-50'} border border-slate-150 rounded my-4 px-3 py-2`">
            <h3 class="font-bold">{{ message.role }}</h3>
            <p class="mt-2">{{ message.content }}</p>
          </div>
        </li>
      </ul>
    </div>
    <div class="mt-4">
      <UForm :state="state" @submit="onSend" @keydown.shift.enter="onSend">
        <div class="flex flex-row w-full gap-2">
          <UTextarea class="flex-1" autoresize :rows="rows" v-model="state.input" />
          <UButton type="submit" :disabled="!model" :loading="sending" class="h-fit">
            Send
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>
