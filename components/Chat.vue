<script setup>

import MarkdownIt from "markdown-it";
import MarkdownItAbbr from "markdown-it-abbr";
import MarkdownItAnchor from "markdown-it-anchor";
import MarkdownItFootnote from "markdown-it-footnote";
import MarkdownItHighlightjs from "markdown-it-highlightjs";
import MarkdownItSub from "markdown-it-sub";
import MarkdownItSup from "markdown-it-sup";
import MarkdownItTasklists from "markdown-it-task-lists";
import MarkdownItTOC from "markdown-it-toc-done-right";
import { loadOllamaHost, loadOllamaUserName, loadOllamaPassword, loadOllamaInstructions } from '@/utils/settings';

const props = defineProps({
  knowledgebase: Object
});

const markdown = new MarkdownIt()
  .use(MarkdownItAbbr)
  .use(MarkdownItAnchor)
  .use(MarkdownItFootnote)
  .use(MarkdownItHighlightjs)
  .use(MarkdownItSub)
  .use(MarkdownItSup)
  .use(MarkdownItTasklists)
  .use(MarkdownItTOC);

const ollamaHost = ref(null);
const instructions = ref([]);
const selectedInstruction = ref(null);

const model = ref(null);
const messages = ref([]);
const sending = ref(false);
const state = reactive({
  instruction: "",
  input: ""
})

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system');
});

watch(model, async (newModel) => {
  messages.value = [];
})

const fetchStream = async (url, options) => {
  const response = await fetch(url, options);

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      chunk.split("\n\n").forEach(async (line) => {
        if (line) {
          console.log('line: ', line);
          const chatMessage = JSON.parse(line);
          const content = chatMessage?.message?.content;
          if (content) {
            if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
              messages.value[messages.value.length - 1].content += content;
            } else {
              messages.value.push({ role: 'assistant', content });
            }
          }
        }
      });
    }
  } else {
    console.log("The browser doesn't support streaming responses.");
  }
}

const onSend = async () => {
  if (sending.value || !state.input?.trim() || !model.value) {
    return;
  }

  sending.value = true;

  const { input } = state;
  rows.value = 1;
  setTimeout(() => {
    state.input = "";
  }, 50);

  if (selectedInstruction.value) {
    if (messages.value.length > 0 && messages.value[0].role === 'system') {
      messages.value[0].content = selectedInstruction.value.instruction;
    } else {
      messages.value = [{
        role: "system",
        content: selectedInstruction.value.instruction
      }, ...messages.value];
    }
  }

  messages.value.push({
    role: "user",
    content: input
  });

  const body = JSON.stringify({
    knowledgebaseId: props.knowledgebase?.id,
    model: model.value,
    messages: [...messages.value],
    stream: true,
  })
  await fetchStream('/api/models/chat', {
    method: 'POST',
    body: body,
    headers: {
      'x_ollama_host': loadOllamaHost(),
      'x_ollama_username': loadOllamaUserName(),
      'x_ollama_password': loadOllamaPassword(),
      'Content-Type': 'application/json',
    },
  });

  sending.value = false;
}

const onModelSelected = (modelName) => {
  model.value = modelName;
}

const rows = ref(1);

onMounted(() => {
  ollamaHost.value = loadOllamaHost();
  instructions.value = [loadOllamaInstructions().map(i => {
    return {
      label: i.name,
      click: () => {
        selectedInstruction.value = i;
      }
    }
  })];
});

</script>
<template>
  <div class="flex flex-col flex-1 p-4">
    <div class="flex flex-row items-center justify-between mb-4 pb-4">
      <div class="flex flex-row" v-if="model">
        <span>Chat with</span>
        <h1 class="font-bold pl-1">{{ model }}</h1>
      </div>
      <ModelsDropdown @modelSelected="onModelSelected" />
    </div>
    <div class="flex flex-row items-center justify-between mb-4 pb-4 border-b border-b-gray-200">
      <UDropdown :items="instructions" :popper="{ placement: 'bottom-start' }">
        <UButton color="white" :label="`${selectedInstruction ? selectedInstruction.name : 'Select Instruction'}`"
          trailing-icon="i-heroicons-chevron-down-20-solid" />
      </UDropdown>
    </div>
    <div dir="ltr" class="relative overflow-y-scroll flex-1 space-y-4">
      <ul className="flex flex-1 flex-col">
        <li v-for="(message, index) in visibleMessages" :key="index">
          <div
            :class="`${message.role == 'assistant' ? 'bg-white/10' : 'bg-primary/20'} border border-primary/20 rounded my-4 px-3 py-2 text-sm`">
            <h3 class="font-bold">{{ message.role }}</h3>
            <div v-html="markdown.render(message.content)" />
          </div>
        </li>
      </ul>
    </div>
    <div class="mt-4">
      <UForm :state="state" @submit="onSend" @keydown.shift.enter="onSend">
        <div class="flex flex-row w-full gap-2">
          <UTextarea class="flex-1" autoresize :rows="rows" :disabled="!model" v-model="state.input" />
          <UButton type="submit" :disabled="!model" :loading="sending" class="h-fit">
            Send
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>

<style>
code {
  color: rgb(37 99 235);
}

.hljs {
  display: block;
  padding: 8px;
  background-color: #e5e5e5;
  margin-top: 8px;
  margin-bottom: 8px;
}
</style>
