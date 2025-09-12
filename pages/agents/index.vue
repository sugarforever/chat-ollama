<script setup lang="ts">
import type { ComponentInstance } from 'vue'
import AgentChat from '~/components/AgentChat.vue'

const { t } = useI18n()
const { isMobile } = useMediaBreakpoints()

const agentChatRef = shallowRef<ComponentInstance<typeof AgentChat>>()
const slideover = useSlideover()

watch(isMobile, val => {
  if (!val) {
    slideover.close()
  }
})

function onNewAgent() {
  // For now, just refresh the component
  agentChatRef.value?.reset()
}
</script>

<template>
  <div class="h-full flex [--chat-side-width:280px]">
    <ClientOnly>
      <AgentChat ref="agentChatRef"
                 class="flex-1 min-w-0 bg-white dark:bg-gray-800">
        <template #left-menu-btn>
          <UButton icon="i-heroicons-bars-3"
                   color="gray"
                   variant="ghost"
                   class="mr-4 md:hidden"
                   @click="onNewAgent">
          </UButton>
        </template>
      </AgentChat>
    </ClientOnly>
  </div>
</template>
