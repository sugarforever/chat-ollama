<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
import { USlideover } from '#components'

const emits = defineEmits<{
  select: [sessionId: number]
  closePanel: []
}>()

const { t } = useI18n()
const createChatSession = useCreateChatSession()
const { isMobile } = useMediaBreakpoints()

const sessionList = ref<ChatSession[]>([])
const currentSessionId = useStorage<number>('currentSessionId', 0)
const confirm = useDialog('confirm')

onMounted(async () => {
  sessionList.value = await getSessionList()

  if (sessionList.value.length > 0) {
    if (currentSessionId.value === -1 || !sessionList.value.some(el => el.id === currentSessionId.value)) {
      currentSessionId.value = sessionList.value[0]?.id || -1
    }
    emits('select', currentSessionId.value)
  }
})

defineExpose({ updateSessionInfo, createChat: onNewChat })

async function onNewChat() {
  const data = await createChatSession()
  sessionList.value.unshift(data)
  onSelectChat(sessionList.value[0].id!)
}

function onSelectChat(sessionId: number) {
  currentSessionId.value = sessionId
  emits('select', sessionId)
}

async function onTopChat(item: ChatSession, direction: string) {
  // 设置clientDB中 chatSessions 的isTop字段为true
  clientDB.chatSessions.update(item.id!, { isTop: direction == 'up' ? Date.now() : 0 })
  sessionList.value = await getSessionList()
}

function onDeleteChat(data: ChatSession) {
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
          onSelectChat(sessionList.value[0].id!)
        } else {
          onSelectChat(0)
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
    <div class="p-3 border-b border-primary-400/30 flex items-center">
      <h3 class="text-primary-600 dark:text-primary-300 mr-auto">{{ t("chat.allChats") }} ({{ sessionList.length }})</h3>
      <UTooltip :text="t('chat.newChat')" :popper="{ placement: 'top' }">
        <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat"></UButton>
      </UTooltip>
      <UButton icon="i-material-symbols-close-rounded" color="gray" class="md:hidden ml-4" @click="emits('closePanel')"></UButton>
    </div>
    <TransitionGroup tag="div" name="list" class="h-[calc(100%-57px)] overflow-auto">
      <div v-for="item in sessionList" :key="item.id"
           class="session-item relative box-border p-2 cursor-pointer dark:text-gray-300 border-b border-b-gray-100 dark:border-b-gray-100/5 border-l-2"
           :class="[
            item.isTop ? 'bg-primary-300/10 dark:bg-primary-800/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30',
            currentSessionId === item.id ? 'border-l-pink-700/80 dark:border-l-pink-400/80' : 'border-l-transparent'
          ]"
           @click="onSelectChat(item.id!)">
        <div class="w-full flex items-center text-sm h-[32px]">
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

.list-enter-active,
.list-leave-active {
  transform-origin: left center;
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-100%) scale(0.3);
}
</style>
