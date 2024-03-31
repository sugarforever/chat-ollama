<script setup lang="ts">
import type { ComponentInstance } from 'vue'
import ChatSessionList from '~/components/ChatSessionList.vue'
import { type Message } from '~/components/Chat.vue'

export interface ChatSessionSettings {
  model?: string
  knowledgeBaseId?: number
  instructionId?: number
}

const chatSessionListRef = shallowRef<ComponentInstance<typeof ChatSessionList>>()
const sessionId = ref(0)
const latestMessageId = ref(0)

function onChangeSettings(data: ChatSessionSettings) {
  chatSessionListRef.value?.updateSessionInfo(data)
}

function onMessage(data: Message) {
  chatSessionListRef.value?.updateSessionInfo({
    title: data.content.slice(0, 20),
    updateTime: data.timestamp,
  })
  if (latestMessageId.value !== data.id) {
    chatSessionListRef.value?.increaseMessageCount()
    latestMessageId.value = data.id!
  }
}
</script>

<template>
  <div class="h-full max-w-5xl mx-auto flex flex-1 border border-gray-200 dark:border-gray-800 rounded-md shadow-md">
    <ChatSessionList ref="chatSessionListRef"
                     class="shrink-0 w-[240px]"
                     @select="id => sessionId = id" />
    <chat v-if="sessionId > 0"
          class="grow p-4"
          :session-id="sessionId"
          @change-settings="onChangeSettings"
          @message="onMessage" />
  </div>
</template>
