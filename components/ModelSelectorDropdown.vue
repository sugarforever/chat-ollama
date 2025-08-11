<script lang="ts" setup>
import type { ModelInfo } from '~/composables/useModels'
import { onMounted, computed, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'

const props = withDefaults(defineProps<{
  autoDefault?: boolean,
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  autoDefault: true,
})

const emits = defineEmits<{
  change: [models: string[], modelsRaw: ModelInfo[]]
}>()

const models = defineModel<string[]>({ default: [] })

const { t } = useI18n()
const { chatModels, loadModels } = useModels()

// State management
const isOpen = ref(false)
const currentView = ref<'families' | 'models'>('families')
const selectedFamily = ref<string | null>(null)
const tempSelection = ref<string[]>([])
const triggerRef = ref()
const dropdownRef = ref()
const dropdownPosition = ref<'bottom' | 'top'>('bottom')
const searchQuery = ref('')

// Ensure models are loaded when component mounts
onMounted(async () => {
  try {
    await loadModels()
  } catch (error) {
    console.warn('Failed to load models in ModelSelectorDropdown:', error)
  }
})

// Group models by family
const modelsByFamily = computed(() => {
  const groups: Record<string, ModelInfo[]> = {}
  chatModels.value.forEach(model => {
    const family = model.family || 'Unknown'
    if (!groups[family]) {
      groups[family] = []
    }
    groups[family].push(model)
  })
  return groups
})

// Get family list with counts
const familyList = computed(() => {
  return Object.entries(modelsByFamily.value).map(([family, familyModels]) => ({
    family,
    count: familyModels.length,
    hasSelected: familyModels.some(m => models.value.includes(m.value))
  })).sort((a, b) => a.family.localeCompare(b.family))
})

// Selected models summary for trigger button
const selectionSummary = computed(() => {
  const count = models.value.length
  if (count === 0) return t('global.selectModels')
  if (count === 1) {
    const model = chatModels.value.find(m => m.value === models.value[0])
    return model ? `${model.family}/${model.label}` : '1 Model'
  }
  return `${count} Models`
})

// Watch for model changes to clean up invalid selections
watch([chatModels, models], ([data1, data2]) => {
  if (data1.length > 0 && data2.length > 0) {
    const validModels = data2.filter(m => data1.some(d => d.value === m))
    if (validModels.length !== data2.length) {
      models.value = validModels
    }
  }
}, { immediate: true })

// Handle family selection
const selectFamily = (family: string) => {
  selectedFamily.value = family
  currentView.value = 'models'
  searchQuery.value = '' // Clear search when entering family
  // Initialize temp selection with current models from this family
  const familyModels = modelsByFamily.value[family] || []
  tempSelection.value = models.value.filter(m =>
    familyModels.some(fm => fm.value === m)
  )
}

// Handle model toggle within family - apply immediately
const toggleModel = (modelValue: string) => {
  const index = tempSelection.value.indexOf(modelValue)
  if (index === -1) {
    tempSelection.value.push(modelValue)
  } else {
    tempSelection.value.splice(index, 1)
  }
  // Apply changes immediately
  applySelection()
}

// Apply selection immediately without closing
const applySelection = () => {
  // Merge temp selection with models from other families
  const otherFamilyModels = models.value.filter(m => {
    const model = chatModels.value.find(cm => cm.value === m)
    return model && model.family !== selectedFamily.value
  })

  const newModels = [...otherFamilyModels, ...tempSelection.value]
  models.value = newModels
  onChange(newModels)
}

// Filtered models based on search query
const filteredModels = computed(() => {
  if (!selectedFamily.value) return []
  const familyModels = modelsByFamily.value[selectedFamily.value] || []
  
  if (!searchQuery.value.trim()) {
    return familyModels
  }
  
  const query = searchQuery.value.toLowerCase()
  return familyModels.filter(model => 
    model.label.toLowerCase().includes(query) ||
    model.name.toLowerCase().includes(query)
  )
})

// Check if search should be shown (more than 6 models)
const shouldShowSearch = computed(() => {
  if (!selectedFamily.value) return false
  const familyModels = modelsByFamily.value[selectedFamily.value] || []
  return familyModels.length > 6
})

// Back to family selection
const backToFamilies = () => {
  currentView.value = 'families'
  selectedFamily.value = null
  tempSelection.value = []
  searchQuery.value = ''
}

// Close dropdown
const closeDropdown = () => {
  isOpen.value = false
  setTimeout(() => {
    currentView.value = 'families'
    selectedFamily.value = null
    tempSelection.value = []
  }, 150)
}

// Calculate dropdown position based on available space
const calculatePosition = () => {
  if (!triggerRef.value) return

  const rect = triggerRef.value.$el.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const dropdownHeight = 400 // Approximate max height

  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top

  // Use 'top' if more space above and insufficient space below
  dropdownPosition.value = spaceAbove > spaceBelow && spaceBelow < dropdownHeight ? 'top' : 'bottom'
}

// Handle dropdown toggle
const toggleDropdown = () => {
  if (!isOpen.value) {
    calculatePosition()
  }
  isOpen.value = !isOpen.value
}

// Emit change event
const onChange = (selectedModels: string[]) => {
  const modelsRaw = chatModels.value
    .filter(model => selectedModels.includes(model.value))
    .map(model => ({ ...model })) // Create plain objects to avoid Vue reactivity issues
  emits('change', selectedModels, modelsRaw)
}

// Set up click outside handler using VueUse
onClickOutside(dropdownRef, () => {
  if (isOpen.value) {
    closeDropdown()
  }
})

</script>

<template>
  <ClientOnly>
    <div ref="dropdownRef" class="relative">
      <!-- Trigger Button -->
      <UButton
               ref="triggerRef"
               :size="size"
               color="gray"
               variant="outline"
               trailing-icon="i-heroicons-chevron-down-20-solid"
               :class="[
                'min-w-[120px] justify-between',
                isOpen && 'ring-2 ring-primary-400 dark:ring-primary-500'
              ]"
               @click="toggleDropdown">
        <div class="flex items-center text-left truncate">
          <UIcon name="i-heroicons-rectangle-stack" class="mr-2 flex-shrink-0" />
          <span class="truncate">{{ selectionSummary }}</span>
        </div>
      </UButton>

      <!-- Dropdown Panel -->
      <Transition
                  enter-active-class="transition ease-out duration-200"
                  enter-from-class="opacity-0 scale-95"
                  enter-to-class="opacity-100 scale-100"
                  leave-active-class="transition ease-in duration-150"
                  leave-from-class="opacity-100 scale-100"
                  leave-to-class="opacity-0 scale-95">

        <UCard
               v-if="isOpen"
               :class="[
                'absolute z-50 min-w-80 max-w-2xl w-max max-h-[500px] overflow-hidden shadow-lg left-0',
                dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
              ]"
               :ui="{
                body: { padding: 'sm:p-0 p-0' }
              }">

          <!-- Family Selection View -->
          <div v-if="currentView === 'families'" class="p-4">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              {{ t('models.selectFamily') || 'Select Model Family' }}
            </h3>

            <div class="space-y-2 max-h-64 overflow-y-auto">
              <div
                   v-for="{ family, count, hasSelected } in familyList"
                   :key="family"
                   class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                   :class="[
                    hasSelected
                      ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  ]"
                   @click="selectFamily(family)">

                <div class="flex items-center">
                  <div class="w-2 h-2 rounded-full mr-3"
                       :class="hasSelected ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                  </div>
                  <span class="text-sm font-medium">{{ family }}</span>
                </div>

                <div class="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <span class="mr-2">{{ count }} models</span>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <!-- Model Selection View -->
          <div v-else-if="currentView === 'models' && selectedFamily" class="flex flex-col max-h-[500px]">
            <!-- Header -->
            <div class="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <UButton
                       icon="i-heroicons-arrow-left-20-solid"
                       size="xs"
                       color="gray"
                       variant="ghost"
                       @click="backToFamilies"
                       class="mr-2" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ selectedFamily }}
              </h3>
            </div>

            <!-- Search Box (if more than 6 models) -->
            <div v-if="shouldShowSearch" class="px-4 pt-3 pb-3">
              <UInput
                v-model="searchQuery"
                icon="i-heroicons-magnifying-glass-20-solid"
                :placeholder="`Search ${selectedFamily} models...`"
                size="sm"
                class="w-full"
                :ui="{
                  base: 'focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600'
                }" />
            </div>

            <!-- Models List -->
            <div class="flex-1 overflow-y-auto p-4 min-h-0 max-h-80" :class="{ 'pt-0': shouldShowSearch }">
              <div v-if="filteredModels.length === 0" class="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                No models found matching "{{ searchQuery }}"
              </div>
              <div v-else class="space-y-2">
                <label
                       v-for="model in filteredModels"
                       :key="model.value"
                       class="flex items-center p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">

                  <UCheckbox
                             :model-value="tempSelection.includes(model.value)"
                             @update:model-value="toggleModel(model.value)"
                             class="mr-3" />

                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {{ model.label }}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </UCard>

      </Transition>
    </div>
  </ClientOnly>
</template>
