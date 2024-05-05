<script lang="ts" setup>
import { useStorage } from '@vueuse/core'

interface ChatSessionInfo extends ChatSession {
  count: number
}

const emits = defineEmits<{
  select: [sessionId: number]
}>()

const { t } = useI18n()
const createChatSession = useCreateChatSession()

const sessionList = ref<ChatSessionInfo[]>([])
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

defineExpose({ updateMessageCount, updateSessionInfo, createChat: onNewChat })

async function onNewChat() {
  const data = await createChatSession()
  sessionList.value.unshift(data)
  onSelectChat(sessionList.value[0].id!)
}

function onSelectChat(sessionId: number) {
  currentSessionId.value = sessionId
  emits('select', sessionId)
}

function onDeleteChat(data: ChatSession) {
  confirm(t("chat.deleteChatConfirm", data.title), {
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
  const list: ChatSessionInfo[] = []
  const result = await clientDB.chatSessions.orderBy('updateTime').reverse().toArray()

  for (const item of result) {
    const count = await clientDB.chatHistories.where('sessionId').equals(item.id!).count()
    list.push({ ...item, count })
  }

  return list
}

async function updateMessageCount(offset: number) {
  const currentSession = sessionList.value.find(el => el.id === currentSessionId.value)!
  currentSession.count = currentSession.count + offset
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
    sessionList.value.sort((a, b) => b.updateTime - a.updateTime)
    await clientDB.chatSessions.where('id').equals(currentSessionId.value).modify(savedData)
  }
}
</script>

<template>
  <div class="h-full box-border bg-gray-100 dark:bg-gray-900 border-r dark:border-gray-800">
    <div class="p-3 border-b border-primary-400/30 flex items-center">
      <h3 class="text-primary-600 dark:text-primary-300 mr-auto">{{ t("chat.allChats") }} ({{ sessionList.length }})</h3>
      <UTooltip :text="t('chat.newChat')" :popper="{ placement: 'top' }">
        <UButton icon="i-material-symbols-add" color="primary" square @click="onNewChat"></UButton>
      </UTooltip>
    </div>
    <TransitionGroup tag="div" name="list" class="h-[calc(100%-57px)] overflow-auto">
      <div v-for="item in sessionList" :key="item.id"
           class="session-item dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-700/30 p-3 cursor-pointer border-b border-gray-200 dark:border-gray-800 flex items-center"
           :class="{ 'bg-primary-100 dark:bg-primary-700/30 activated': currentSessionId === item.id }"
           @click="onSelectChat(item.id!)">
        <div class="grow overflow-hidden">
          <div class="line-clamp-1">{{ item.title || `${t("chat.newChat")} ${item.id}` }}</div>
          <div class="text-sm text-muted line-clamp-1">{{ t("chat.messagesCount", [item.count]) }}</div>
        </div>
        <UButton icon="i-material-symbols-delete-outline" size="2xs" color="red" class="btn-delete"
                 @click.stop="onDeleteChat(item)"></UButton>
      </div>
    </TransitionGroup>
  </div>
</template>

<style lang="scss" scoped>
.session-item {
  overflow: hidden;

  &.activated {
    border-left: 2px solid rgb(var(--color-primary-500));
  }

  .btn-delete {
    transition: all 0.3s;
    transform-origin: right center;
    transform: translateX(calc(100% + 0.75rem)) scale(0);
    opacity: 0;
  }

  &:hover {
    .btn-delete {
      transform: translateX(0) scale(1);
      opacity: 1;
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
