# Brand Icons Management - Best Practices

This document outlines the implemented brand icon management system for Chat Ollama, providing efficient, type-safe, and scalable handling of brand logos.

## Overview

The brand icons system provides:
- **Type Safety**: Full TypeScript support with proper type definitions
- **Tree Shaking**: Only loads icons that are actually used
- **Lazy Loading**: Icons are loaded on-demand to improve performance
- **Fallback Support**: Graceful degradation to Material Design icons
- **Centralized Management**: Single source of truth for all brand icons

## Architecture

### 1. SVG Assets (`/assets/svg/`)
All brand SVG files are stored in the `assets/svg/` directory:
- `openai.svg`
- `anthropic.svg`
- `azure.svg`
- `deepseek.svg`
- `gemini.svg`
- `groq.svg`
- `moonshot.svg`
- `siliconcloud.svg`

### 2. Composable (`/composables/useBrandIcons.ts`)
The core logic for managing brand icons:
- **Type Definitions**: `BrandKey` type for supported brands
- **Lazy Loading**: Dynamic imports with Promise-based loading
- **Mapping**: Server keys to brand keys mapping
- **Fallback Icons**: Material Design icons as fallbacks
- **Preloading**: Ability to preload commonly used icons

### 3. Component (`/components/BrandIcon.vue`)
Reusable Vue component for displaying brand icons:
- **Props**: `brand`, `serverKey`, `size`, `class`, `fallbackToIcon`
- **Sizes**: `xs`, `sm`, `md`, `lg`, `xl`
- **Loading States**: Skeleton loading animation
- **Error Handling**: Graceful fallback to alternative icons

### 4. Vite Configuration
SVG loader configuration in `nuxt.config.ts`:
```typescript
import svgLoader from 'vite-svg-loader'

export default defineNuxtConfig({
  vite: {
    plugins: [
      svgLoader({
        defaultImport: 'component'
      })
    ]
  }
})
```

### 5. Type Declarations (`/types/svg.d.ts`)
TypeScript declarations for SVG imports:
```typescript
declare module '*.svg' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}
```

## Usage Examples

### Basic Usage
```vue
<template>
  <!-- Using server key -->
  <BrandIcon server-key="openAi" size="md" />
  
  <!-- Using brand key directly -->
  <BrandIcon brand="anthropic" size="lg" />
  
  <!-- With custom classes -->
  <BrandIcon 
    server-key="gemini" 
    size="xl" 
    class="text-blue-600 dark:text-blue-400" 
  />
</template>
```

### In Settings Panel
```vue
<template>
  <div class="server-item">
    <BrandIcon 
      :server-key="item.key" 
      size="md" 
      class="mr-3" 
      :class="isSelected ? 'text-primary-600' : 'text-gray-500'" 
    />
    <span>{{ item.title }}</span>
  </div>
</template>
```

### Programmatic Usage
```vue
<script setup>
const { loadBrandIcon, hasBrandIcon, getFallbackIcon } = useBrandIcons()

// Check if brand icon exists
const hasIcon = hasBrandIcon('openAi') // true

// Get fallback icon name
const fallback = getFallbackIcon('openAi') // 'i-simple-icons-openai'

// Preload icons
onMounted(async () => {
  await preloadCommonIcons()
})
</script>
```

## Best Practices

### 1. **Use Server Keys When Possible**
Always prefer using `server-key` prop over `brand` prop when dealing with server configurations:
```vue
<!-- Good -->
<BrandIcon server-key="openAi" />

<!-- Avoid unless necessary -->
<BrandIcon brand="openai" />
```

### 2. **Appropriate Sizing**
Choose appropriate sizes for different contexts:
- `xs` (12px): Small inline icons
- `sm` (16px): Compact lists, badges
- `md` (20px): Standard buttons, navigation
- `lg` (24px): Headers, prominent features
- `xl` (32px): Large displays, hero sections

### 3. **Color Management**
Icons inherit the current text color. Use CSS classes for color management:
```vue
<BrandIcon 
  server-key="openAi" 
  class="text-green-600 dark:text-green-400" 
/>
```

### 4. **Performance Optimization**
- Icons are lazy-loaded by default
- Use `preloadCommonIcons()` for frequently used icons
- Tree-shaking ensures only imported icons are bundled

### 5. **Adding New Brand Icons**

To add a new brand icon:

1. **Add SVG file** to `/assets/svg/[brand].svg`
2. **Update BrandKey type** in `useBrandIcons.ts`:
   ```typescript
   export type BrandKey = 'openai' | 'anthropic' | 'newbrand'
   ```
3. **Add to brandIcons object**:
   ```typescript
   const brandIcons: Record<BrandKey, () => Promise<Component>> = {
     // ... existing icons
     newbrand: () => import('~/assets/svg/newbrand.svg'),
   }
   ```
4. **Add fallback icon**:
   ```typescript
   const fallbackIcons: Record<BrandKey, string> = {
     // ... existing fallbacks
     newbrand: 'i-material-symbols-fallback-icon',
   }
   ```
5. **Add display name**:
   ```typescript
   const brandNames: Record<BrandKey, string> = {
     // ... existing names
     newbrand: 'New Brand',
   }
   ```
6. **Map server key** (if applicable):
   ```typescript
   const serverToBrandMap: Record<string, BrandKey> = {
     // ... existing mappings
     newBrandServer: 'newbrand',
   }
   ```

## Benefits

### 1. **Performance**
- **Lazy Loading**: Icons load only when needed
- **Tree Shaking**: Unused icons are not included in bundle
- **Caching**: Loaded icons are cached in memory
- **Preloading**: Critical icons can be preloaded

### 2. **Developer Experience**
- **Type Safety**: Full TypeScript support prevents typos
- **IntelliSense**: Auto-completion for all brand keys
- **Consistent API**: Same interface across all components
- **Error Handling**: Graceful fallbacks prevent broken UI

### 3. **Maintainability**
- **Centralized**: All icon logic in one place
- **Extensible**: Easy to add new brands
- **Consistent**: Uniform icon handling across app
- **Testable**: Composable can be unit tested

### 4. **User Experience**
- **Fast Loading**: Icons appear quickly with skeleton states
- **Consistent**: Same visual treatment for all brands
- **Accessible**: Proper fallbacks ensure icons always display
- **Responsive**: Icons scale appropriately for different sizes

## Demo

Visit `/brand-icons-demo` to see all brand icons in action with different sizes and configurations.

## Troubleshooting

### Icons Not Loading
1. Check that SVG file exists in `/assets/svg/`
2. Verify brand key is added to `BrandKey` type
3. Ensure vite-svg-loader is properly configured
4. Check browser console for import errors

### Type Errors
1. Restart TypeScript service in your IDE
2. Verify `/types/svg.d.ts` is included in `tsconfig.json`
3. Check that all brand keys are properly typed

### Performance Issues
1. Use `preloadCommonIcons()` for frequently used icons
2. Consider reducing the number of simultaneous icon loads
3. Verify tree-shaking is working correctly
