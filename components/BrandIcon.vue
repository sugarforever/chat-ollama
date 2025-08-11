<script setup lang="ts">
import type { BrandKey } from '~/composables/useBrandIcons'

interface Props {
    brand?: BrandKey | string
    serverKey?: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    class?: string
    fallbackToIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    size: 'md',
    fallbackToIcon: true
})

const { loadBrandIcon, getFallbackIcon, hasBrandIcon, serverToBrandMap } = useBrandIcons()

// Determine the brand key from props
const brandKey = computed(() => {
    if (props.brand && props.brand in serverToBrandMap) {
        return props.brand as BrandKey
    }
    if (props.serverKey && props.serverKey in serverToBrandMap) {
        return serverToBrandMap[props.serverKey]
    }
    return null
})

// Load the brand icon component
const brandIconComponent = ref<Component | null>(null)
const isLoading = ref(false)
const loadError = ref(false)

// Size classes mapping
const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8'
}

// Fallback icon
const fallbackIconName = computed(() => {
    if (props.serverKey) {
        return getFallbackIcon(props.serverKey)
    }
    return 'i-material-symbols-help'
})

// Computed classes
const iconClasses = computed(() => [
    sizeClasses[props.size],
    'flex-shrink-0',
    props.class
])

// Load brand icon when brand key changes
watchEffect(async () => {
    if (!brandKey.value) return

    try {
        isLoading.value = true
        loadError.value = false

        const component = await loadBrandIcon(brandKey.value)
        brandIconComponent.value = component

        if (!component) {
            loadError.value = true
        }
    } catch (error) {
        console.warn(`Failed to load brand icon for ${brandKey.value}:`, error)
        loadError.value = true
    } finally {
        isLoading.value = false
    }
})

// Should show brand icon
const shouldShowBrandIcon = computed(() => {
    return brandIconComponent.value && !loadError.value && !isLoading.value
})

// Should show fallback
const shouldShowFallback = computed(() => {
    return props.fallbackToIcon && (!brandIconComponent.value || loadError.value || isLoading.value)
})
</script>

<template>
    <div :class="iconClasses">
        <!-- Loading state -->
        <div
             v-if="isLoading"
             :class="[sizeClasses[size], 'animate-pulse bg-gray-300 dark:bg-gray-600 rounded']" />

        <!-- Brand icon component -->
        <component
                   v-else-if="shouldShowBrandIcon"
                   :is="brandIconComponent"
                   :class="[sizeClasses[size], 'text-current']" />

        <!-- Fallback icon -->
        <UIcon
               v-else-if="shouldShowFallback"
               :name="fallbackIconName"
               :class="[sizeClasses[size], 'text-current']" />

        <!-- No icon fallback -->
        <div
             v-else
             :class="[sizeClasses[size], 'bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center']">
            <span class="text-xs font-bold text-gray-600 dark:text-gray-300">?</span>
        </div>
    </div>
</template>

<style scoped>
/* Ensure SVG icons inherit current color */
:deep(svg) {
    width: 100%;
    height: 100%;
    fill: currentColor;
}

/* Loading animation */
@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }
}

.animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
