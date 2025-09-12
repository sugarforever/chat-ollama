<script setup lang="ts">
interface Props {
  show: boolean
  position: { x: number; y: number }
}

interface Emits {
  click: []
  close: []
}

const props = defineProps<Props>()
const emits = defineEmits<Emits>()

const buttonRef = ref<HTMLElement>()

const buttonStyle = computed(() => {
  const { x, y } = props.position
  return {
    position: 'fixed',
    top: `${y}px`,
    left: `${x}px`,
    zIndex: 9998, // One level below the dialog
  }
})

const handleClick = () => {
  emits('click')
}

// Close button when clicking outside or pressing escape
onMounted(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (props.show && buttonRef.value && !buttonRef.value.contains(event.target as Node)) {
      emits('close')
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.show) {
      emits('close')
    }
  }

  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside)
    document.removeEventListener('keydown', handleKeydown)
  })
})
</script>

<template>
  <Teleport to="body">
    <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 scale-90"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition-all duration-150 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-90">
      <div
           v-if="show"
           ref="buttonRef"
           :style="buttonStyle"
           class="quick-chat-button"
           @click="handleClick">
        <div class="flex items-center justify-center w-8 h-8 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg cursor-pointer transition-all duration-200 hover:scale-110">
          <UIcon name="i-heroicons-bolt" class="text-sm" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
