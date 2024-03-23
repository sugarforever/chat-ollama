<script setup lang="ts">
import { useStorage, useMutationObserver } from '@vueuse/core'
import MarkdownIt from "markdown-it";
import MarkdownItAbbr from "markdown-it-abbr";
import MarkdownItAnchor from "markdown-it-anchor";
import MarkdownItFootnote from "markdown-it-footnote";
import MarkdownItHighlightjs from "markdown-it-highlightjs";
import MarkdownItSub from "markdown-it-sub";
import MarkdownItSup from "markdown-it-sup";
import MarkdownItTasklists from "markdown-it-task-lists";
import MarkdownItTOC from "markdown-it-toc-done-right";
import {
  fetchHeadersOllama,
  fetchHeadersThirdApi,
  loadOllamaInstructions,
} from '@/utils/settings';
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'

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

const instructions = ref<{ label: string, click: () => void }[][]>([]);
const selectedInstruction = ref<Awaited<ReturnType<typeof loadOllamaInstructions>>[number]>();
const chatInputBoxRef = shallowRef()

const model = useStorage(`model${props.knowledgebase?.id || ''}`, null);
const messages = ref<Array<{ role: 'system' | 'assistant' | 'user', content: string }>>([]);
const sending = ref(false);

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system');
});

watch(model, async (newModel) => {
  messages.value = [];
})

const fetchStream = async (url: string, options: RequestInit) => {
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

const onSend = async (data: ChatBoxFormData) => {
  const input = data.content.trim()
  if (sending.value || !input || !model.value) {
    return;
  }

  sending.value = true;
  chatInputBoxRef.value?.reset()

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
      ...fetchHeadersOllama.value,
      ...fetchHeadersThirdApi.value,
      'Content-Type': 'application/json',
    },
  });

  sending.value = false;
}

onMounted(async () => {
  instructions.value = [(await loadOllamaInstructions()).map(i => {
    return {
      label: i.name,
      click: () => {
        selectedInstruction.value = i;
      }
    }
  })];
});

const messageListEl = shallowRef<HTMLElement>();
useMutationObserver(messageListEl, () => {
  messageListEl.value?.scrollTo({
    top: messageListEl.value.scrollHeight,
    behavior: 'smooth'
  });
}, { childList: true, subtree: true });

</script>

<template>
  <div class="flex flex-col flex-1 box-border dark:text-gray-300 -mx-4">
    <div class="flex items-center justify-between mb-4 px-4 shrink-0">
      <div class="flex items-center">
        <span class="mr-2">Chat with</span>
        <ModelsDropdown v-model="model" placeholder="Select a model" />
      </div>
      <div>
        <ClientOnly>
          <UDropdown :items="instructions" :popper="{ placement: 'bottom-start' }">
            <UButton color="white" :label="`${selectedInstruction ? selectedInstruction.name : 'Select Instruction'}`"
              trailing-icon="i-heroicons-chevron-down-20-solid" />
          </UDropdown>
        </ClientOnly>
      </div>
    </div>
    <div ref="messageListEl" class="relative flex-1 overflow-auto px-4">
      <div v-for="(message, index) in visibleMessages" :key="index" :class="{ 'text-right': message.role === 'user' }">
        <div class="text-gray-500 dark:text-gray-400">{{ message.role }}</div>
        <div class="mb-4">
          <div
            :class="`inline-flex ${message.role == 'assistant' ? 'bg-white/10' : 'bg-primary-50 dark:bg-primary-400/20'} border border-primary/20 rounded-lg px-3 py-2`">
            <div v-html="markdown.render(message.content)" />
          </div>
        </div>
      </div>
    </div>
    <div class="shrink-0 pt-4 px-4">
      <ChatInputBox ref="chatInputBoxRef" :disabled="!model" :loading="sending" @submit="onSend" />
    </div>
  </div>
</template>

<style>
code {
  color: rgb(31, 64, 226);
  white-space: pre-wrap;
  margin: 0 0.4em;
}

.dark code {
  color: rgb(125, 179, 250);
}
</style>
