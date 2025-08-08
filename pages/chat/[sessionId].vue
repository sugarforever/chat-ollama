<script setup lang="ts">
import type { ComponentInstance } from 'vue'
import ChatSessionList from '~/components/ChatSessionList.vue'
import Chat from '~/components/Chat.vue'
import type { ChatMessage } from '@/types/chat'

export interface ChatSessionSettings extends Partial<Omit<ChatSession, 'id' | 'createTime'>> { }

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatSessionListRef = shallowRef<ComponentInstance<typeof ChatSessionList>>()
const chatRef = shallowRef<ComponentInstance<typeof Chat>>()
const slideover = useSlideover()
const { isMobile } = useMediaBreakpoints()

// Get sessionId from route params
const sessionId = ref(Number(route.params.sessionId) || 0)
const latestMessageId = ref(0)
const isSessionListVisible = ref(true)

// Watch for route changes
watch(() => route.params.sessionId, (newSessionId) => {
  sessionId.value = Number(newSessionId) || 0
})

watch(isMobile, val => {
  if (!val) {
    slideover.close()
  }
})

function onChangeSettings(data: ChatSessionSettings) {
  chatSessionListRef.value?.updateSessionInfo({ ...data, forceUpdateTitle: true })
}

function onMessage(data: ChatMessage | null) {
  // remove a message if it's null
  if (data === null) {
    return
  }

  const content = typeof data.content === 'string' ? data.content : 'New message'
  chatSessionListRef.value?.updateSessionInfo({
    title: content.slice(0, 20),
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
  // Navigate to the new session URL
  await router.push(`/chat/${id}`)
}

function onOpenSideMenu() {
  slideover.open(ChatSessionList, {
    ref: chatSessionListRef,
    onSelect: onChangeChatSession,
    onClosePanel: () => {
      slideover.close()
    },
    side: 'left',
    preventClose: true,
  })
}

function toggleSidebar() {
  isSessionListVisible.value = !isSessionListVisible.value
}

provide('isSessionListVisible', isSessionListVisible)
</script>

<template>
  <div class="h-full flex" style="--chat-side-width:280px">
    <ClientOnly>
      <ChatSessionList ref="chatSessionListRef"
                       class="shrink-0 w-[var(--chat-side-width)] hidden md:block transition-all duration-300 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                       :class="{ 'md:!hidden': !isSessionListVisible }"
                       @select="onChangeChatSession" />
    </ClientOnly>
    <ClientOnly>
      <Chat ref="chatRef" v-if="sessionId > 0"
            class="flex-1 min-w-0 bg-white dark:bg-gray-800"
            :session-id="sessionId"
            @change-settings="onChangeSettings"
            @message="onMessage"
            @toggle-sidebar="toggleSidebar">
        <template #left-menu-btn>
          <UButton :icon="isSessionListVisible ? 'i-material-symbols-lists-rounded' : 'i-heroicons-chevron-double-right'" 
                   color="gray" 
                   variant="ghost"
                   class="mr-4 md:hidden" 
                   :class="{ 'rotate-180': isSessionListVisible }" 
                   @click="onOpenSideMenu">
          </UButton>
        </template>
      </Chat>
      <div v-else class="flex-1 flex flex-col justify-center items-center p-8 bg-white dark:bg-gray-800">
        <div class="text-center space-y-4">
          <div class="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
            <Icon name="i-iconoir-chat-lines" class="w-8 h-8 text-gray-400" />
          </div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{{ t("chat.welcome") || "Welcome to Chat" }}</h2>
          <p class="text-gray-600 dark:text-gray-400 max-w-md">{{ t("chat.welcomeMessage") || "Start a new conversation to begin chatting with your AI assistant." }}</p>
          <UButton icon="i-material-symbols-add" 
                   color="primary" 
                   size="lg"
                   @click="onNewChat">
            {{ t("chat.newChat") }}
          </UButton>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>