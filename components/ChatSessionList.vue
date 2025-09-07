<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
import { USlideover } from '#components'

const props = defineProps<{
  isCollapsed?: boolean
}>()

const emits = defineEmits<{
  select: [sessionId: number]
  closePanel: []
}>()

const { t } = useI18n()
const router = useRouter()
const createChatSession = useCreateChatSession()
const { isMobile } = useMediaBreakpoints()

const sessionList = ref<ChatSession[]>([])
const currentSessionId = useStorage<number>('currentSessionId', 0)
const confirm = useDialog('confirm')
const isCreatingChat = ref(false)

onMounted(async () => {
  sessionList.value = await getSessionList()

  if (sessionList.value.length > 0) {
    const currentRoute = router.currentRoute.value

    // If we're on the dynamic route, use the route param as the current session
    if (currentRoute.path.startsWith('/chat/') && currentRoute.params.sessionId) {
      const routeSessionId = Number(currentRoute.params.sessionId)
      if (routeSessionId > 0 && sessionList.value.some(el => el.id === routeSessionId)) {
        currentSessionId.value = routeSessionId
      }
    } else {
      // Fallback to stored session or first session
      if (currentSessionId.value === -1 || !sessionList.value.some(el => el.id === currentSessionId.value)) {
        currentSessionId.value = sessionList.value[0]?.id || -1
      }
    }

    emits('select', currentSessionId.value)
  }
})

defineExpose({ updateSessionInfo, createChat: onNewChat })

async function onNewChat() {
  if (isCreatingChat.value) return

  isCreatingChat.value = true
  try {
    const data = await createChatSession()
    sessionList.value.unshift(data)
    await router.push(`/chat/${data.id}`)
  } catch (error) {
    console.error('Failed to create new chat session:', error)
    // Still try to navigate even if session creation fails
    const tempId = Date.now() // Use timestamp as fallback ID
    await router.push(`/chat/${tempId}`)
  } finally {
    isCreatingChat.value = false
  }
}

async function onSelectChat(sessionId: number) {
  currentSessionId.value = sessionId
  emits('select', sessionId)

  // Also navigate to the session URL if we're using the dynamic routing
  const currentRoute = router.currentRoute.value
  if (currentRoute.path.startsWith('/chat/')) {
    try {
      await router.push(`/chat/${sessionId}`)
    } catch (error) {
      console.error('Failed to navigate to session:', error)
    }
  }
}

async function onTopChat(item: ChatSession, direction: string) {
  // 设置clientDB中 chatSessions 的isTop字段为true
  clientDB.chatSessions.update(item.id!, { isTop: direction == 'up' ? Date.now() : 0 })
  sessionList.value = await getSessionList()
}

async function onDeleteChat(data: ChatSession) {
  confirm(t("chat.deleteChatConfirm", [data.title || `${t("chat.newChat")} ${data.id}`]), {
    title: t('chat.deleteChat'),
    dangerouslyUseHTMLString: true,
  })
    .then(async () => {

      const sessionId = data.id!
      sessionList.value = sessionList.value.filter(el => el.id !== sessionId)
      await clientDB.chatSessions.where('id').equals(sessionId).delete()
      await clientDB.chatHistories.where('sessionId').equals(sessionId).delete()

      if (currentSessionId.value === sessionId) {
        if (sessionList.value.length > 0) {
          await onSelectChat(sessionList.value[0].id!)
        } else {
          await onSelectChat(0)
        }
      }
    })
    .catch(noop)
}

async function getSessionList() {
  const list: ChatSession[] = []
  const result = await clientDB.chatSessions.orderBy('updateTime').reverse().toArray()

  for (const item of result) {
    list.push({ ...item, isTop: item.isTop || 0 })
  }

  return sortSessionList(list)
}

function sortSessionList(data: ChatSession[]) {
  const pinTopList: ChatSession[] = []
  const list: ChatSession[] = []

  data.forEach(el => el.isTop > 0 ? pinTopList.push(el) : list.push(el))
  pinTopList.sort((a, b) => b.isTop - a.isTop)
  list.sort((a, b) => b.updateTime - a.updateTime)
  return [...pinTopList, ...list]
}

async function updateSessionInfo(data: Partial<Omit<ChatSession, 'id' | 'createTime'> & { forceUpdateTitle: boolean }>) {
  const currentSession = sessionList.value.find(el => el.id === currentSessionId.value)!
  let savedData: Partial<ChatSession>

  if (data.title && (data.forceUpdateTitle || !currentSession.title)) {
    savedData = omit(data, ['forceUpdateTitle'])
  } else {
    savedData = omit(data, ['title', 'forceUpdateTitle'])
  }

  if (Object.keys(savedData).length > 0) {
    Object.assign(currentSession, savedData)
    sessionList.value = sortSessionList(sessionList.value)
    await clientDB.chatSessions.where('id').equals(currentSessionId.value).modify(savedData)
  }
}
</script>

<template>
  <Component :is="isMobile ? USlideover : 'div'"
             :class="isMobile ? 'w-[80vw] max-w-[400px] h-full' : 'border-r dark:border-gray-800'"
             class="h-full box-border">
    <!-- Header - Different layout for collapsed/expanded -->
    <div class="h-14 border-b border-primary-400/30 flex items-center"
         :class="props.isCollapsed ? 'px-2 justify-center' : 'px-3'">
      <!-- Expanded Header -->
      <template v-if="!props.isCollapsed">
        <h3 class="text-primary-600 dark:text-primary-300 mr-auto">{{ t("chat.allChats") }} ({{ sessionList.length }})</h3>
        <UTooltip :text="t('chat.newChat')" :popper="{ placement: 'top' }">
          <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat"></UButton>
        </UTooltip>
        <UButton icon="i-material-symbols-close-rounded" color="gray" class="md:hidden ml-4" @click="emits('closePanel')"></UButton>
      </template>

      <!-- Collapsed Header - Just the + icon -->
      <template v-else>
        <UTooltip :text="t('chat.newChat')" :popper="{ placement: 'right' }">
          <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat"></UButton>
        </UTooltip>
      </template>
    </div>
    <TransitionGroup tag="div" class="h-[calc(100%-57px)] overflow-auto">
      <div v-for="item in sessionList" :key="item.id"
           class="session-item relative cursor-pointer dark:text-gray-300 border-b border-b-gray-100 dark:border-b-gray-100/5"
           :class="[
            props.isCollapsed ? 'p-2 border-l-0' : 'p-2 border-l-2',
            item.isTop ? 'bg-primary-300/10 dark:bg-primary-800/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30',
            !props.isCollapsed && currentSessionId === item.id ? 'border-l-pink-700/80 dark:border-l-pink-400/80' : 'border-l-transparent'
          ]"
           @click="onSelectChat(item.id!)">

        <!-- Expanded View -->
        <div v-if="!props.isCollapsed" class="w-full flex items-center text-sm h-[32px]">
          <div class="line-clamp-1 grow"
               :class="currentSessionId === item.id ? 'text-pink-700  dark:text-pink-400 font-bold' : 'opacity-80'">
            {{ item.title || `${t("chat.newChat")} ${item.id}` }}
          </div>
          <ChatSessionListActionMore :data="item"
                                     class="action-more"
                                     @pin="onTopChat(item, 'up')"
                                     @unpin="onTopChat(item, 'down')"
                                     @delete="onDeleteChat(item)" />
        </div>

        <!-- Collapsed View - Icon Only -->
        <div v-else class="w-full flex items-center justify-center h-[32px]">
          <UTooltip :text="item.title || `${t('chat.newChat')} ${item.id}`" :popper="{ placement: 'right' }">
            <div class="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                 :class="[
                  currentSessionId === item.id
                    ? 'bg-pink-700/20 dark:bg-pink-400/20 text-pink-700 dark:text-pink-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                ]">
              <UIcon name="i-material-symbols-chat-bubble-outline" class="w-3 h-3" />
            </div>
          </UTooltip>
        </div>
      </div>
    </TransitionGroup>
  </Component>
</template>

<style lang="scss" scoped>
.session-item {

  :deep() {
    @media (pointer: fine) {
      .action-more {
        display: none;
      }
    }
  }

  &:hover {
    :deep() .action-more {
      display: block;
    }
  }
}
</style>
