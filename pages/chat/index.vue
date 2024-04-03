<script setup lang="ts">
import type { ComponentInstance } from 'vue'
import ChatSessionList from '~/components/ChatSessionList.vue'
import { type Message } from '~/components/Chat.vue'

export interface ChatSessionSettings extends Partial<Omit<ChatSession, 'id' | 'createTime'>> { }

const chatSessionListRef = shallowRef<ComponentInstance<typeof ChatSessionList>>()
const sessionId = ref(0)
const latestMessageId = ref(0)

function onChangeSettings(data: ChatSessionSettings) {
  chatSessionListRef.value?.updateSessionInfo({ ...data, forceUpdateTitle: true })
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

function onNewChat() {
  chatSessionListRef.value?.createChat()
}
</script>

<template>
  <div class="h-full max-w-6xl mx-auto flex flex-1 border border-gray-200 dark:border-gray-800 rounded-md shadow-md">
    <ChatSessionList ref="chatSessionListRef"
                     class="shrink-0 w-[240px]"
                     @select="id => sessionId = id" />
    <chat v-if="sessionId > 0"
          class="grow px-4 pb-4"
          :session-id="sessionId"
          @change-settings="onChangeSettings"
          @message="onMessage" />
    <div v-else class="grow h-full flex justify-center items-center">
      <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat">New Chat</UButton>
    </div>
  </div>
</template>
