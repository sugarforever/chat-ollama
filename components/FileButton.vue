<script lang="ts" setup>
const props = defineProps<{
  name?: string
  color?: string
  accept?: string
  multiple?: boolean
  directory?: boolean
  disabled?: boolean
}>()

const emits = defineEmits<{
  change: [files: File[]]
}>()

const toast = useToast()

const selected = defineModel<File[]>({ default: () => [] })
const inputRef = shallowRef<HTMLInputElement>()
const exts = computed(() => props.accept?.split(',').map(it => it.trim().toLowerCase()) || [])

function onFileChange(e: Event) {
  const files = [...(e.target as any).files] as File[]
  if (files.length > 0) {
    const validFiles = (props.directory && exts.value.length > 0
      ? files.filter(it => exts.value.some(ext => it.name.toLowerCase().endsWith(ext)))
      : files)

    const arr = validFiles.filter(v => !selected.value.some(el => el.name === v.name && el.size === v.size && el.lastModified === v.lastModified))

    if (arr.length < validFiles.length) {
      toast.add({
        title: 'Tips',
        description: `Filtered ${validFiles.length - arr.length} existing files.`,
        color: 'amber',
      })
    }

    selected.value = [...selected.value, ...arr]
    emits('change', [...selected.value])
  }
}

function onClick() {
  inputRef.value!.value = ''
  inputRef.value!.click()
}
</script>

<template>
  <div class="relative inline-flex overflow-hidden cursor-pointer">
    <UButton :color="color" :disabled @click="onClick">
      <slot></slot>
    </UButton>
    <input ref="inputRef"
           :name="name"
           type="file"
           :accept="accept"
           :multiple="multiple"
           :webkitdirectory="directory"
           :directory="directory"
           class="opacity-0 fixed top-0 left-0 w-0 h-0 -z-1"
           @change="onFileChange" />
  </div>
</template>
