<script setup lang="ts">
import type { ComponentInstance } from 'vue'
import ChatSessionList from '~/components/ChatSessionList.vue'
import Chat from '~/components/Chat.vue'
import type { ChatMessage } from '@/types/chat'

export interface ChatSessionSettings extends Partial<Omit<ChatSession, 'id' | 'createTime'>> { }

const { t } = useI18n()
const chatSessionListRef = shallowRef<ComponentInstance<typeof ChatSessionList>>()
const chatRef = shallowRef<ComponentInstance<typeof Chat>>()

const sessionId = ref(0)
const latestMessageId = ref(0)

function onChangeSettings(data: ChatSessionSettings) {
  chatSessionListRef.value?.updateSessionInfo({ ...data, forceUpdateTitle: true })
}

function onMessage(data: ChatMessage | null) {
  // remove a message if it's null
  if (data === null) {
    return
  }

  chatSessionListRef.value?.updateSessionInfo({
    title: data.content.slice(0, 20),
    updateTime: data.endTime || data.startTime,
  })
  if (latestMessageId.value !== data.id) {
    latestMessageId.value = data.id!
  }
}

function onNewChat() {
  chatSessionListRef.value?.createChat()
}

async function onChangeChatSession(id: number) {
  sessionId.value = id
}
</script>

<template>
  <div class="h-full max-w-6xl mx-auto flex flex-1 border border-gray-200 dark:border-gray-800 rounded-md shadow-md"
       style="--chat-side-width:240px">
    <ChatSessionList ref="chatSessionListRef"
                     class="shrink-0 w-[var(--chat-side-width)]"
                     @select="onChangeChatSession" />
    <chat ref="chatRef" v-if="sessionId > 0"
          class="flex-1 px-4 pb-4 box-border w-[calc(100%-var(--chat-side-width))]"
          :session-id="sessionId"
          @change-settings="onChangeSettings"
          @message="onMessage" />
    <div v-else class="grow h-full flex justify-center items-center">
      <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat">{{ t("chat.newChat") }}</UButton>
    </div>
  </div>
</template>
