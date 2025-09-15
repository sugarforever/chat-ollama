<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
import { type SubmitMode } from './TheTextarea.vue'
import type { ModelInfo } from '~/composables/useModels'

type ChatContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>

export interface ChatBoxFormData {
  content: ChatContent
  images?: File[]
  hijackedModels?: string[] // Models hijacked by @model mentions
  sanitizedContent?: ChatContent
}

const props = defineProps<{
  disabled?: boolean
  loading?: boolean
}>()

const emits = defineEmits<{
  submit: [data: ChatBoxFormData]
  stop: []
}>()

const { isMobile } = useMediaBreakpoints()
const { t } = useI18n()
const { chatModels } = useModels()
const submitMode = useStorage<SubmitMode>('sendMode', 'enter')

// @model functionality
const isShowingModelSuggestions = ref(false)
const modelSuggestions = ref<ModelInfo[]>([])
const selectedSuggestionIndex = ref(-1)
const currentAtModelMatch = ref<{ startIndex: number; endIndex: number; model: ModelInfo | null; query: string } | null>(null)
const currentView = ref<'families' | 'models'>('families')
const selectedFamily = ref<string | null>(null)
const modelFamilies = ref<{ family: string; count: number; models: ModelInfo[] }[]>([])
const searchQuery = ref('')
const filteredModelSuggestions = ref<ModelInfo[]>([])
const isNavigatingViews = ref(false) // Flag to prevent hiding during navigation

// Group models by family
const groupModelsByFamily = () => {
  const families: Record<string, ModelInfo[]> = {}
  chatModels.value.forEach(model => {
    const family = model.family || 'Other'
    if (!families[family]) {
      families[family] = []
    }
    families[family].push(model)
  })

  modelFamilies.value = Object.entries(families).map(([family, models]) => ({
    family,
    count: models.length,
    models: models.sort((a, b) => a.label.localeCompare(b.label))
  })).sort((a, b) => a.family.localeCompare(b.family))
}

// Get filtered model suggestions based on query
const getModelSuggestions = (query: string): ModelInfo[] => {
  if (!query.trim()) {
    return chatModels.value.slice(0, 8)
  }

  const searchQuery = query.toLowerCase()
  return chatModels.value
    .filter(model =>
      model.name.toLowerCase().includes(searchQuery) ||
      model.label.toLowerCase().includes(searchQuery) ||
      (model.family && model.family.toLowerCase().includes(searchQuery))
    )
    .slice(0, 8)
}

// Parse @model mentions from text
const parseAtModelFromText = (text: string, cursorPosition: number) => {
  if (typeof text !== 'string') return null

  // Updated regex to match model names with hyphens, colons, dots, and slashes
  const regex = /@([a-zA-Z0-9\-:._\/]*)/g
  let match

  while ((match = regex.exec(text)) !== null) {
    const startIndex = match.index
    const endIndex = startIndex + match[0].length
    const query = match[1]

    if (cursorPosition >= startIndex && cursorPosition <= endIndex) {
      const exactModel = chatModels.value.find(model => {
        // Direct name/label match
        if (model.name.toLowerCase() === query.toLowerCase() ||
          model.label.toLowerCase() === query.toLowerCase()) {
          return true
        }

        // Check if the query matches the full model value (for slash-prefixed models)
        if (model.value.toLowerCase() === query.toLowerCase()) {
          return true
        }

        // Check if the mentioned name matches the model part after the family separator
        const valueParts = model.value.split('/')
        if (valueParts.length > 1) {
          const modelPart = valueParts[valueParts.length - 1] // Get the last part (model name)
          return modelPart.toLowerCase() === query.toLowerCase()
        }

        return false
      })

      return {
        startIndex,
        endIndex,
        model: exactModel || null,
        query
      }
    }
  }

  return null
}

// Fallback matcher used if the tracked selection was cleared (e.g. focus lost)
const findLastAtModelMatch = (text: string) => {
  if (typeof text !== 'string') return null

  const regex = /@([a-zA-Z0-9\-:._\/]*)/g
  let match
  let lastMatch: { startIndex: number; endIndex: number; query: string; model: ModelInfo | null } | null = null

  while ((match = regex.exec(text)) !== null) {
    lastMatch = {
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      query: match[1],
      model: null
    }
  }

  return lastMatch
}

// Extract completed @model mentions
const extractCompletedAtModels = (text: string): ModelInfo[] => {
  if (typeof text !== 'string') return []

  // Updated regex to match model names with hyphens, colons, dots, and slashes
  const regex = /@([a-zA-Z0-9\-:._\/]+)/g
  const matches = []
  let match

  while ((match = regex.exec(text)) !== null) {
    const modelName = match[1]
    // Try to find model by name, label, full value, or check if it's the model part of the value
    const foundModel = chatModels.value.find(model => {
      // Direct name/label match
      if (model.name.toLowerCase() === modelName.toLowerCase() ||
        model.label.toLowerCase() === modelName.toLowerCase()) {
        return true
      }

      // Check if the query matches the full model value (for slash-prefixed models)
      if (model.value.toLowerCase() === modelName.toLowerCase()) {
        return true
      }

      // Check if the mentioned name matches the model part after the family separator
      const valueParts = model.value.split('/')
      if (valueParts.length > 1) {
        const modelPart = valueParts[valueParts.length - 1] // Get the last part (model name)
        return modelPart.toLowerCase() === modelName.toLowerCase()
      }

      return false
    })

    if (foundModel) {
      matches.push(foundModel)
    }
  }

  return matches
}

// Remove @model mentions from text
const removeAtModelMentions = (text: string): string => {
  if (typeof text !== 'string') return text
  // Updated regex to match model names with hyphens, colons, dots, and slashes
  return text.replace(/@[a-zA-Z0-9\-:._\/]+/g, '').trim()
}

// Calculate dropdown position based on available space
const calculateDropdownPosition = () => {
  if (!textareaRef.value) return

  try {
    const textareaEl = textareaRef.value.$el?.querySelector('textarea')
    if (!textareaEl) return

    const rect = textareaEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const dropdownHeight = 280 // Approximate height of dropdown

    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom

    // Use bottom position if more space below, otherwise use top
    dropdownPosition.value = spaceBelow > dropdownHeight || spaceBelow > spaceAbove ? 'bottom' : 'top'
  } catch (error) {
    // Fallback to top position
    dropdownPosition.value = 'top'
  }
}

// Filter models based on search query
const filterModels = () => {
  if (!searchQuery.value.trim()) {
    filteredModelSuggestions.value = modelSuggestions.value
  } else {
    const query = searchQuery.value.toLowerCase()
    filteredModelSuggestions.value = modelSuggestions.value.filter(model =>
      model.name.toLowerCase().includes(query) ||
      model.label.toLowerCase().includes(query)
    )
  }
  selectedSuggestionIndex.value = -1
}

// Handle family selection
const selectFamily = (family: string) => {
  isNavigatingViews.value = true // Prevent hiding during navigation
  selectedFamily.value = family
  currentView.value = 'models'
  selectedSuggestionIndex.value = -1
  searchQuery.value = ''

  // Set model suggestions to models in this family
  const familyGroup = modelFamilies.value.find(f => f.family === family)
  modelSuggestions.value = familyGroup ? familyGroup.models : []
  filteredModelSuggestions.value = modelSuggestions.value

  // Reset flag after navigation is complete with a longer delay
  setTimeout(() => {
    isNavigatingViews.value = false
  }, 350) // Slightly longer than blur timeout to ensure proper sequencing
}

// Go back to family view
const backToFamilies = () => {
  isNavigatingViews.value = true // Prevent hiding during navigation
  currentView.value = 'families'
  selectedFamily.value = null
  selectedSuggestionIndex.value = -1
  modelSuggestions.value = []
  filteredModelSuggestions.value = []
  searchQuery.value = ''

  // Reset flag after navigation is complete with a longer delay
  setTimeout(() => {
    isNavigatingViews.value = false
  }, 350) // Slightly longer than blur timeout to ensure proper sequencing
}

// Handle text change to detect @model
const handleTextChange = (text: string, cursorPosition: number) => {
  const match = parseAtModelFromText(text, cursorPosition)

  if (match) {
    currentAtModelMatch.value = match
    groupModelsByFamily() // Ensure families are grouped
    calculateDropdownPosition()
    isShowingModelSuggestions.value = true
    currentView.value = 'families' // Always start with families
    selectedFamily.value = null
    selectedSuggestionIndex.value = -1
    modelSuggestions.value = []
  } else {
    hideModelSuggestions()
  }
}

// Hide model suggestions
const hideModelSuggestions = () => {
  isShowingModelSuggestions.value = false
  modelSuggestions.value = []
  filteredModelSuggestions.value = []
  selectedSuggestionIndex.value = -1
  currentAtModelMatch.value = null
  currentView.value = 'families'
  selectedFamily.value = null
  searchQuery.value = ''
  isNavigatingViews.value = false // Reset navigation flag
}

// Handle keyboard navigation
const handleSuggestionKeydown = (event: KeyboardEvent): boolean => {
  if (!isShowingModelSuggestions.value) {
    return false
  }

  const itemCount = currentView.value === 'families'
    ? modelFamilies.value.length
    : filteredModelSuggestions.value.length

  if (itemCount === 0) return false

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedSuggestionIndex.value = Math.min(
        selectedSuggestionIndex.value + 1,
        itemCount - 1
      )
      return true

    case 'ArrowUp':
      event.preventDefault()
      selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, -1)
      return true

    case 'ArrowRight':
    case 'Enter':
      if (selectedSuggestionIndex.value >= 0) {
        event.preventDefault()
        if (currentView.value === 'families') {
          const family = modelFamilies.value[selectedSuggestionIndex.value]
          if (family) {
            selectFamily(family.family)
          }
        } else {
          // Select model
          return true
        }
      }
      return true

    case 'ArrowLeft':
      if (currentView.value === 'models') {
        event.preventDefault()
        backToFamilies()
        return true
      }
      break

    case 'Tab':
      if (selectedSuggestionIndex.value >= 0 && currentView.value === 'models') {
        event.preventDefault()
        return true
      }
      break

    case 'Escape':
      event.preventDefault()
      hideModelSuggestions()
      return true
  }

  return false
}

// Get selected suggestion
const getSelectedSuggestion = (): ModelInfo | null => {
  if (currentView.value === 'models' && selectedSuggestionIndex.value >= 0 && selectedSuggestionIndex.value < filteredModelSuggestions.value.length) {
    return filteredModelSuggestions.value[selectedSuggestionIndex.value]
  }
  return null
}

// Apply model suggestion to text
const applySuggestion = (model: ModelInfo, text: string): string => {
  if (typeof text !== 'string') return text

  const activeMatch = currentAtModelMatch.value || findLastAtModelMatch(text)
  if (!activeMatch) return text

  const { startIndex, endIndex } = activeMatch
  const beforeMatch = text.substring(0, startIndex)
  const afterMatch = text.substring(endIndex)

  return `${beforeMatch}@${model.name}${afterMatch}`
}

const state = reactive<ChatBoxFormData>({
  content: '',
  images: [],
  hijackedModels: []
})
const tip = computed(() => {
  const s = sendModeList.value[0].find(el => el.value === submitMode.value)?.label || ''
  return ` (${s})`
})
const isFocus = ref(false)
const sendModeList = computed(() => {
  return [
    [
      { label: t('chat.enter'), value: 'enter' as const, click: onChangeMode },
      { label: t('chat.shiftEnter'), value: 'shift-enter' as const, click: onChangeMode },
    ]
  ]
})
const disabledBtn = computed(() => {
  if (typeof state.content === 'string') {
    return props.disabled || (!props.loading && !state.content.trim() && (!state.images || state.images.length === 0))
  }
  return props.disabled || (!props.loading && (!state.images || state.images.length === 0))
})
const btnTip = computed(() => props.loading ? t('chat.stop') : (isMobile.value ? '' : tip.value))
const imagePreviewUrls = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()
const textareaRef = ref()
const dropdownPosition = ref<'top' | 'bottom'>('top')

// Show search when there are more than 6 models in the family
const shouldShowSearch = computed(() => {
  return currentView.value === 'models' && modelSuggestions.value.length > 6
})

// Watch for content changes to detect @model mentions
watch(() => state.content, (newContent) => {
  try {
    if (typeof newContent === 'string' && textareaRef.value && !props.disabled) {
      const cursorPosition = textareaRef.value.getCursorPosition?.() || 0
      handleTextChange(newContent as string, cursorPosition)

      const completed = extractCompletedAtModels(newContent)
      state.hijackedModels = Array.from(new Set(completed.map(model => model.value)))
    } else if (state.hijackedModels?.length) {
      state.hijackedModels = []
    }
  } catch (error) {
    console.error('Error in content watcher:', error)
    // Hide suggestions on error to prevent further issues
    hideModelSuggestions()
  }
}, { flush: 'post' })

// Watch for changes in available models to update families
watch(() => chatModels.value, () => {
  if (chatModels.value.length > 0) {
    groupModelsByFamily()
  }
}, { immediate: true })

// Watch for search query changes to filter models
watch(() => searchQuery.value, () => {
  if (currentView.value === 'models') {
    filterModels()
  }
})

defineExpose({
  reset: onReset
})

function onChangeMode(this: typeof sendModeList.value[number][number]) {
  submitMode.value = this.value
}

// Add new function to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64String = reader.result as string
      // Remove the data:image/xxx;base64, prefix
      const base64 = base64String.split(',')[1]
      resolve(base64)
    }
    reader.onerror = error => reject(error)
  })
}

// Handle model selection from autocomplete
function onSelectModel(model?: ModelInfo | any) {
  const selectedModel = model || getSelectedSuggestion()
  if (selectedModel && typeof state.content === 'string') {
    state.content = applySuggestion(selectedModel, state.content)
    hideModelSuggestions()
    // Focus back to textarea
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
}

// Handle textarea blur event
function onTextareaBlur() {
  try {
    isFocus.value = false
    // Use nextTick to ensure the dropdown click can be processed before hiding
    nextTick(() => {
      setTimeout(() => {
        // Don't hide if we're navigating between views
        if (!isNavigatingViews.value) {
          hideModelSuggestions()
        }
      }, 300) // Increased timeout to allow dropdown clicks to register
    })
  } catch (error) {
    console.error('Error in onTextareaBlur:', error)
  }
}

// Handle keyboard events for model suggestions
function onTextareaKeydown(event: KeyboardEvent) {
  try {
    if (handleSuggestionKeydown(event)) {
      if (event.key === 'Enter' || event.key === 'Tab') {
        onSelectModel()
      }
    }
  } catch (error) {
    console.error('Error in onTextareaKeydown:', error)
  }
}

// Modify the onSubmit function
async function onSubmit() {
  if (props.disabled) return

  // Extract @model mentions before processing
  let hijackedModels: string[] = []
  let sanitizedContent: ChatContent | undefined

  if (typeof state.content === 'string') {
    const mentionedModels = extractCompletedAtModels(state.content)
    const mentionedValues = mentionedModels.map(model => model.value)
    if (mentionedValues.length > 0) {
      hijackedModels = Array.from(new Set(mentionedValues))
    } else if (state.hijackedModels?.length) {
      hijackedModels = Array.from(new Set(state.hijackedModels))
    }
    const stripped = removeAtModelMentions(state.content)
    sanitizedContent = stripped
  }

  // If there are images, convert them to base64 and create content array
  if (state.images && state.images.length > 0) {
    const content: Exclude<ChatContent, string> = []
    const sanitizedArray: Exclude<ChatContent, string> = []

    // Add text content if any
    if (typeof state.content === 'string' && state.content.trim()) {
      content.push({ type: "text", text: state.content.trim() })

      const sanitizedText = typeof sanitizedContent === 'string' ? sanitizedContent : removeAtModelMentions(state.content)
      if (sanitizedText.trim()) {
        sanitizedArray.push({ type: 'text', text: sanitizedText.trim() })
      }
    }

    // Add each image as base64
    for (const image of state.images) {
      const base64Image = await fileToBase64(image)
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${image.type};base64,${base64Image}`,
        },
      })

      sanitizedArray.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.type};base64,${base64Image}`,
        }
      })
    }

    sanitizedContent = sanitizedArray.length > 0 ? sanitizedArray : sanitizedContent

    emits('submit', { content, hijackedModels, sanitizedContent })
  } else {
    // If no images, just send text content as before
    const textContent = typeof state.content === 'string' ? state.content : ''
    emits('submit', { content: textContent, hijackedModels, sanitizedContent })
  }
}

function onStop(e: Event) {
  if (props.loading) {
    e.preventDefault()
    emits('stop')
  }
}

function onReset() {
  state.content = ''
  state.images = []
  state.hijackedModels = []

  // Clear existing preview URLs and revoke object URLs to prevent memory leaks
  imagePreviewUrls.value.forEach(url => {
    URL.revokeObjectURL(url)
  })
  imagePreviewUrls.value = []

  // Also reset the file input if it exists
  if (fileInput.value) {
    fileInput.value.value = ''
  }

  // Hide model suggestions and reset navigation state
  hideModelSuggestions()
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  console.log('Files selected:', input.files)

  // Convert FileList to array and filter for image files
  const fileArray = Array.from(input.files)
  state.images = fileArray.filter(file => file.type.startsWith('image/'))
  console.log('Image files:', state.images)

  // Generate preview URLs for the images
  imagePreviewUrls.value = []
  if (state.images && state.images.length > 0) {
    state.images.forEach(file => {
      const url = URL.createObjectURL(file)
      console.log('Created URL for', file.name, ':', url)
      imagePreviewUrls.value.push(url)
    })
    console.log('Preview URLs:', imagePreviewUrls.value)
  }
}

function removeImage(index: number) {
  if (state.images) {
    // Revoke the URL to prevent memory leaks
    URL.revokeObjectURL(imagePreviewUrls.value[index])

    // Remove the image from the arrays
    state.images = state.images.filter((_, i) => i !== index)
    imagePreviewUrls.value = imagePreviewUrls.value.filter((_, i) => i !== index)
  }
}

</script>

<template>
  <div
       class="chat-input-box border rounded-lg p-2 transition-all duration-300 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
       :class="[isFocus ? 'shadow-lg shadow-primary-400/30 dark:shadow-primary-700/20 border-primary-400 dark:border-primary-700' : '']">

    <!-- Image preview panel -->
    <div v-if="imagePreviewUrls.length > 0" class="mb-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
      <div v-for="(url, index) in imagePreviewUrls" :key="index" class="relative rounded-lg overflow-hidden">
        <img :src="url" class="rounded-md h-20 w-auto max-w-[150px] object-cover" />
        <button
                @click="removeImage(index)"
                class="absolute top-1 right-1 rounded-full bg-gray-800/70 text-white p-1 transition-opacity duration-200 opacity-80 hover:opacity-100"
                type="button">
          <span class="i-heroicons-x-mark-20-solid w-3 h-3"></span>
        </button>
      </div>
    </div>

    <UForm :state="state" @submit="onSubmit">
      <div class="relative">
        <TheTextarea
                     ref="textareaRef"
                     v-model="state.content"
                     :max-rows="15"
                     :min-rows="2"
                     :submit-mode="submitMode"
                     :placeholder="t('chat.saySomething')"
                     @focus="isFocus = true"
                     @blur="onTextareaBlur"
                     @keydown="onTextareaKeydown" />

        <!-- Model Suggestions Dropdown -->
        <Transition
                    enter-active-class="transition ease-out duration-200"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition ease-in duration-150"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95">

          <UCard
                 v-if="isShowingModelSuggestions && (modelFamilies.length > 0 || modelSuggestions.length > 0)"
                 :class="[
                  'absolute left-0 w-80 max-h-80 overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg',
                  'contain-[layout_style] will-change-[transform,opacity]',
                  dropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
                ]"
                 style="z-index: 10000; max-width: calc(100vw - 2rem);"
                 :ui="{ body: { padding: 'p-0' } }">

            <!-- Family Selection View -->
            <div v-if="currentView === 'families'" class="p-3">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                  <UIcon name="i-heroicons-rectangle-stack" class="mr-2 w-4 h-4" />
                  Model Families
                </h3>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ modelFamilies.length }} families
                </div>
              </div>

              <div class="space-y-1 max-h-60 overflow-y-auto">
                <div
                     v-for="(family, index) in modelFamilies"
                     :key="family.family"
                     class="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-150"
                     :class="[
                      index === selectedSuggestionIndex
                        ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-200 dark:border-primary-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-transparent'
                    ]"
                     @click="selectFamily(family.family)">

                  <div class="flex items-center">
                    <div class="w-2 h-2 rounded-full mr-3 bg-primary-500"></div>
                    <div>
                      <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {{ family.family }}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <span class="mr-2">{{ family.count }} models</span>
                    <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Model Selection View -->
            <div v-else-if="currentView === 'models' && selectedFamily" class="flex flex-col max-h-80">
              <!-- Header -->
              <div class="flex items-center p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <UButton
                         icon="i-heroicons-arrow-left"
                         size="xs"
                         color="gray"
                         variant="ghost"
                         @click="backToFamilies"
                         class="mr-2" />
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                  <UIcon name="i-heroicons-cpu-chip" class="mr-2 w-4 h-4" />
                  {{ selectedFamily }}
                </h3>
                <div class="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {{ modelSuggestions.length }} models
                </div>
              </div>

              <!-- Search Box (if more than 6 models) -->
              <div v-if="shouldShowSearch" class="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/25">
                <UInput
                        v-model="searchQuery"
                        icon="i-heroicons-magnifying-glass"
                        :placeholder="`Search ${selectedFamily} models...`"
                        size="sm"
                        class="w-full"
                        :ui="{
                          base: 'focus:ring-1 focus:ring-primary-300 dark:focus:ring-primary-600'
                        }" />
              </div>

              <!-- Models List -->
              <div class="flex-1 overflow-y-auto p-3" :class="{ 'pt-0': shouldShowSearch }">
                <div v-if="filteredModelSuggestions.length === 0 && searchQuery.trim()" class="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  No models found matching "{{ searchQuery }}"
                </div>
                <div v-else-if="filteredModelSuggestions.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  No models available
                </div>
                <div v-else class="space-y-1">
                  <div
                       v-for="(model, index) in filteredModelSuggestions"
                       :key="model.value"
                       class="flex items-center p-2 rounded-lg cursor-pointer transition-all duration-150"
                       :class="[
                        index === selectedSuggestionIndex
                          ? 'bg-primary-100 dark:bg-primary-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      ]"
                       @click="onSelectModel(model)">

                    <UIcon name="i-heroicons-cpu-chip" class="mr-3 text-primary-500 w-4 h-4" />
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {{ model.label }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {{ model.name }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer with instructions -->
            <div class="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 text-center">
                <span v-if="currentView === 'families'">
                  Use ↑↓ to navigate, → or Enter to expand
                </span>
                <span v-else-if="shouldShowSearch">
                  Type to search • ↑↓ to navigate • ← to go back • Enter to select
                </span>
                <span v-else>
                  Use ↑↓ to navigate, ← to go back, Enter to select
                </span>
              </div>
            </div>
          </UCard>
        </Transition>
      </div>
      <div class="flex items-center">
        <div class="flex items-center">
          <input
                 type="file"
                 accept="image/*"
                 multiple
                 class="hidden"
                 ref="fileInput"
                 @change="handleFileInputChange" />
          <UButton
                   variant="ghost"
                   color="gray"
                   @click="fileInput?.click()">
            <span class="i-heroicons-photo-20-solid w-5 h-5"></span>
          </UButton>
        </div>
        <slot></slot>
        <div class="flex items-center ml-auto">
          <ClientOnly>
            <UButton type="submit" :disabled="disabledBtn"
                     :class="!isMobile ? 'rounded-r-none' : ''"
                     :icon="loading ? 'i-iconoir-square' : 'i-iconoir-send-diagonal'" @click="onStop">
              <span class="text-xs text-primary-200" v-show="btnTip">{{ btnTip }}</span>
            </UButton>
            <UDropdown v-if="!isMobile" :items="sendModeList" :popper="{ placement: 'top-end' }">
              <UButton trailing-icon="i-heroicons-chevron-down-20-solid"
                       class="rounded-l-none border-l border-primary-400" />
            </UDropdown>
          </ClientOnly>
        </div>
      </div>
    </UForm>
  </div>
</template>

<style scoped>
/* Only essential deep styles that can't be replaced with Tailwind */
.chat-input-box :deep(textarea) {
  outline: none;
  border: none;
  box-shadow: none;
  background: transparent;
}
</style>
