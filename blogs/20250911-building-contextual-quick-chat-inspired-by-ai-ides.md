# Building Contextual Quick Chat: When AI IDEs Inspire Web Applications

> How we brought the familiar "quick edit" experience from AI IDEs to web-based chat applications, solving text selection persistence and creating a truly contextual AI assistant.

## The Inspiration: AI IDEs Done Right

If you've used modern AI-powered IDEs like Cursor, GitHub Copilot, or Claude Code, you've experienced a delightful interaction pattern: select some code, right-click or use a keyboard shortcut, and instantly get contextual AI assistance in a compact dialog. No context switching, no copy-pasting, no losing your place in the code.

This interaction is so intuitive that when users encounter it, they immediately understand what to do. The selected text provides perfect context, the dialog appears exactly where needed, and the AI assistance feels truly integrated into the workflow.

## The Challenge: Bringing This to Web Chat

When building ChatOllama, we realized that web-based AI chat applications were missing this crucial interaction pattern. Users would:

1. **Read content** in the chat history
2. **Want to ask** about a specific part
3. **Copy and paste** the relevant text
4. **Switch context** to the input field
5. **Manually explain** what they're referring to

This workflow breaks the natural flow of conversation. What if we could eliminate steps 3, 4, and 5 entirely?

## Design Goals: Learning from the Best

Our goals were inspired by the best practices we'd seen in AI IDEs:

### 1. **Zero Context Switching**
The dialog should appear exactly where the user is reading, not force them to look elsewhere.

### 2. **Perfect Context Preservation**
The selected text should remain visually highlighted throughout the interaction.

### 3. **Compact and Focused**
No need for full chat interface complexity—just quick, contextual assistance.

### 4. **Model Consistency**
Use the same AI model as the current session, maintaining conversation continuity.

### 5. **Non-Disruptive**
Never interfere with the main chat flow or conversation history.

## Technical Architecture: Building for Simplicity

### Component Structure

```typescript
// Core components
QuickChat.vue           // Floating dialog UI
useQuickChat()          // Chat logic and API communication  
useTextSelection()      // Selection handling and preservation
```

### Key Design Decisions

#### 1. **Floating Dialog with Smart Positioning**

```typescript
const dialogStyle = computed(() => {
  const { x, y } = props.position
  return {
    position: 'fixed',
    top: `${Math.min(y, window.innerHeight - 280)}px`,
    left: `${Math.min(x, window.innerWidth - 320)}px`,
    zIndex: 9999,
    maxWidth: '320px',
    width: '320px'
  }
})
```

The dialog appears near the selection but intelligently stays within viewport bounds.

#### 2. **Separate API Strategy**

Instead of mixing quick chat with regular conversation history, we created a dedicated endpoint that:

- Uses the current session's model
- Bypasses conversation storage
- Includes selected content as context
- Returns streaming responses

```typescript
const sendQuickChat = async (userQuery: string, selectedContent?: string) => {
  let systemPrompt = defaultSystemPrompt
  if (selectedContent) {
    systemPrompt += `\n\nSelected content for context:\n"""${selectedContent}"""`
  }
  
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery }
  ]
  
  // Uses current session's model configuration
  const response = await fetch('/api/models/chat', {
    method: 'POST',
    headers: { ...getKeysHeader() }, // Critical for model consistency
    body: JSON.stringify({ model, family, messages, stream: true })
  })
}
```

#### 3. **Model Inheritance**

The trickiest part was ensuring the quick chat used the same model as the current conversation:

```typescript
// Pass current session models to quick chat
<QuickChat
  :current-models="models"
  :selected-content="selectedContent"
/>

// Quick chat prioritizes session models
if (!availableModel && currentModels.value.length > 0) {
  availableModel = currentModels.value[0] // Use session's first model
} else if (!availableModel) {
  availableModel = chatModels.value[0]?.value // Fallback to available models
}
```

## The Selection Persistence Challenge

This turned out to be the most technically challenging aspect of the feature.

### The Problem

When a dialog opens and its input field receives focus, browsers automatically clear any existing text selections. This is standard behavior, but it breaks our UX goal of maintaining visual context.

### Failed Approaches

#### 1. **DOM Manipulation**
Our first attempt wrapped selected text in a `<span>` with highlight CSS. This worked visually but broke the original DOM structure and caused issues with range restoration.

#### 2. **CSS Class on Parent Elements**
Adding highlight classes to common ancestor elements highlighted entire paragraphs instead of just the selected text.

### The Winning Solution: Aggressive Range Restoration

We ended up with a multi-layered approach:

```typescript
export function useTextSelection() {
  const savedRange = ref<Range | null>(null)
  
  const showQuickChat = (selectionInfo: SelectionInfo) => {
    // Clone the range to preserve it independently
    savedRange.value = selectionInfo.range.cloneRange()
    isQuickChatVisible.value = true
  }
  
  const restoreSelection = () => {
    if (savedRange.value) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        
        // Create fresh range to avoid DOM staleness
        const newRange = document.createRange()
        newRange.setStart(savedRange.value.startContainer, savedRange.value.startOffset)
        newRange.setEnd(savedRange.value.endContainer, savedRange.value.endOffset)
        selection.addRange(newRange)
      }
    }
  }
}
```

#### Key Techniques:

1. **Range Cloning**: Clone the selection range immediately to preserve it independently
2. **Delayed Focus**: Wait 200ms before focusing the input to allow selection restoration
3. **High-Frequency Monitoring**: Check every 10ms while dialog is open and restore selection if cleared
4. **Fresh Range Creation**: Create new Range objects to avoid stale DOM references

```typescript
// In Chat.vue - Aggressive selection maintenance
watch(isQuickChatVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      restoreSelection()
      
      // Monitor and restore every 10ms
      const maintainSelection = setInterval(() => {
        if (isQuickChatVisible.value) {
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) {
            restoreSelection()
          }
        } else {
          clearInterval(maintainSelection)
        }
      }, 10)
    })
  }
})
```

## User Experience Refinements

### Compact UI Design

The dialog is intentionally small and focused:

```vue
<template>
  <div class="quick-chat-dialog" style="width: 320px">
    <!-- Minimal header with title and close button -->
    <div class="p-3 border-b">
      <h3 class="text-base font-medium">Quick Chat</h3>
    </div>
    
    <!-- Compact input area -->
    <div class="p-3">
      <textarea rows="2" class="text-sm" />
      <div class="flex justify-between mt-2">
        <div class="text-xs text-gray-400">Enter to send, Escape to close</div>
        <UButton size="xs">Send</UButton>
      </div>
    </div>
    
    <!-- Response with limited height -->
    <div class="max-h-40 overflow-y-auto p-3">
      {{ response }}
    </div>
  </div>
</template>
```

### Keyboard Interactions

- **Enter**: Send query
- **Shift + Enter**: New line in input
- **Escape**: Close dialog
- **Click outside**: Close dialog

### Streaming Response Display

Just like the main chat, quick chat supports streaming responses with a compact typing indicator:

```vue
<div v-if="isLoading" class="flex items-center mt-2">
  <div class="flex space-x-1">
    <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce"></div>
    <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
    <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
  </div>
</div>
```

## Development Process: Iterative Excellence

### Phase 1: Proof of Concept
- Basic dialog that appears on text selection
- Simple API call without streaming
- Manual positioning

### Phase 2: Selection Persistence 
- Implemented range saving and restoration
- Added smart positioning within viewport
- Introduced compact UI design

### Phase 3: Model Consistency
- Fixed model inheritance from current session
- Added proper authentication headers
- Implemented streaming responses

### Phase 4: Polish and Refinement
- Refined selection restoration algorithm
- Added keyboard shortcuts
- Optimized performance with interval management
- Added comprehensive error handling

## Technical Challenges and Solutions

### Challenge 1: Browser Selection Behavior

**Problem**: Different browsers handle text selection differently, especially when DOM elements receive focus.

**Solution**: Test across browsers and implement defensive programming with try-catch blocks and multiple restoration strategies.

### Challenge 2: DOM Range Staleness

**Problem**: Saved Range objects can become invalid if the DOM structure changes.

**Solution**: Always create fresh Range objects when restoring, using the saved start/end positions rather than the Range object directly.

### Challenge 3: Performance with High-Frequency Monitoring

**Problem**: Checking selection every 10ms could impact performance.

**Solution**: Only run the interval while the dialog is visible, and clean up immediately when it closes.

### Challenge 4: Viewport Edge Cases

**Problem**: Dialog positioning near viewport edges could cause it to appear off-screen.

**Solution**: Implement smart positioning logic that considers available space and repositions accordingly.

## Architecture Patterns and Best Practices

### 1. Composable-First Design

```typescript
// Clean separation of concerns
const { isQuickChatVisible, selectedContent, setupSelectionHandler } = useTextSelection()
const { query, response, sendQuickChat } = useQuickChat()
```

### 2. Reactive Props for Dynamic Configuration

```typescript
// Component adapts to changing session state
const quickChatOptions = computed(() => ({
  currentModels: props.currentModels
}))

const useQuickChat(quickChatOptions)
```

### 3. Event-Driven Communication

```vue
<QuickChat
  v-model:show="isQuickChatVisible"
  @close="hideQuickChat"
  @send="handleQuickChatSend"
/>
```

### 4. Defensive Error Handling

```typescript
try {
  const newRange = document.createRange()
  newRange.setStart(savedRange.value.startContainer, savedRange.value.startOffset)
  selection.addRange(newRange)
} catch (e) {
  console.warn('Failed to restore selection:', e)
  // Gracefully continue without breaking the UI
}
```

## Performance Considerations

### 1. Lazy Loading

Quick chat functionality is only activated when needed:

```typescript
// Only setup selection handlers after component mounts
onMounted(() => {
  setupSelectionHandler(messageListEl.value)
})
```

### 2. Efficient Event Management

```typescript
// Clean up interval when dialog closes
watch(isQuickChatVisible, (visible) => {
  if (visible) {
    const interval = setInterval(restoreSelection, 10)
    // Store reference for cleanup
    onUnmounted(() => clearInterval(interval))
  }
})
```

### 3. Minimal DOM Queries

```typescript
// Cache DOM references instead of repeated queries
const dialogRef = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()
```

## Testing Strategy

### Unit Tests for Core Logic

```typescript
describe('useTextSelection', () => {
  it('should preserve selection range when dialog opens', () => {
    const { showQuickChat, savedRange } = useTextSelection()
    const mockRange = createMockRange('selected text')
    
    showQuickChat({ selectedText: 'test', range: mockRange })
    
    expect(savedRange.value).not.toBeNull()
    expect(savedRange.value.toString()).toBe('selected text')
  })
})
```

### Integration Tests for User Workflows

```typescript
describe('Quick Chat Workflow', () => {
  it('should maintain selection throughout interaction', async () => {
    // Simulate text selection
    selectText('important text')
    
    // Dialog should appear
    expect(quickChatDialog).toBeVisible()
    
    // Selection should still be visible
    expect(getSelection().toString()).toBe('important text')
    
    // After sending query, selection persists
    await sendQuery('What does this mean?')
    expect(getSelection().toString()).toBe('important text')
  })
})
```

## Internationalization Support

The feature includes comprehensive i18n support:

```json
{
  "quickChat": {
    "title": "Quick Chat",
    "placeholder": "Ask about the selected content...",
    "shortcuts": "Enter to send, Escape to close",
    "send": "Send",
    "sending": "Sending...",
    "thinking": "Thinking...",
    "error": "An error occurred while processing your request",
    "noModelAvailable": "No AI model available. Please configure a model first."
  }
}
```

With Chinese translations:

```json
{
  "quickChat": {
    "title": "快速对话",
    "placeholder": "询问选中的内容...",
    "shortcuts": "回车发送，ESC 关闭",
    "send": "发送",
    "sending": "发送中...",
    "thinking": "思考中...",
    "error": "处理您的请求时发生错误",
    "noModelAvailable": "没有可用的AI模型。请先配置一个模型。"
  }
}
```

## Lessons Learned

### 1. User Experience Drives Technical Decisions

The requirement to maintain visual selection context led us through multiple technical approaches. The UX goal was non-negotiable, so we adapted the technical solution until it worked perfectly.

### 2. Browser APIs Have Subtle Differences

Text selection behavior varies across browsers. Testing on Chrome, Firefox, and Safari revealed different edge cases that required defensive programming.

### 3. Simple Features Can Have Complex Implementations

What appears to be a "simple" dialog actually required:
- Advanced DOM manipulation
- Performance optimization
- Cross-browser compatibility
- Accessibility considerations
- Error boundary management

### 4. Inspiration from Other Tools Works

Taking the interaction pattern from AI IDEs and adapting it to web chat worked beautifully. Users immediately understood how to use the feature.

### 5. Iteration Leads to Excellence

Each phase of development revealed new requirements and opportunities for improvement. The final implementation is much more robust than our initial concept.

## Future Enhancements

### 1. Multi-Selection Support

Support for multiple text selections across different parts of the conversation:

```typescript
interface MultiSelection {
  ranges: Range[]
  contexts: string[]
  combinedQuery: string
}
```

### 2. Quick Actions Menu

Expand beyond just "ask" to include other contextual actions:

```typescript
const quickActions = [
  { id: 'explain', label: 'Explain this', icon: 'lightbulb' },
  { id: 'translate', label: 'Translate', icon: 'language' },
  { id: 'summarize', label: 'Summarize', icon: 'document' },
  { id: 'code-review', label: 'Review code', icon: 'code' }
]
```

### 3. Smart Context Detection

Automatically determine the best context strategy based on selection:

```typescript
const contextStrategies = {
  code: (selection) => ({ language: detectLanguage(selection), type: 'code' }),
  prose: (selection) => ({ type: 'text', sentiment: detectSentiment(selection) }),
  data: (selection) => ({ type: 'structured', format: detectFormat(selection) })
}
```

### 4. Persistent Quick Chat History

For power users who want to track their quick queries:

```typescript
interface QuickChatHistory {
  id: string
  query: string
  selectedContent: string
  response: string
  timestamp: Date
  sessionId: string
}
```

## Impact and Reception

Since implementing this feature, we've observed:

- **Higher engagement** with chat history content
- **Reduced copy-paste operations** in user workflows  
- **More contextual questions** being asked
- **Positive feedback** from users familiar with AI IDEs
- **Faster iteration** on complex topics

The feature has proven that bringing familiar interaction patterns from desktop tools to web applications can significantly improve user experience.

## Conclusion

Building the contextual quick chat feature taught us that great user experiences often require solving seemingly simple problems in sophisticated ways. The challenge wasn't building a chat dialog—it was preserving text selection across focus changes in web browsers while maintaining perfect model consistency and creating a delightful, non-disruptive interaction.

By taking inspiration from AI IDEs and adapting their best practices to web applications, we created something that feels both familiar and innovative. The technical complexity is hidden behind a simple, intuitive interface that users immediately understand.

This project reinforced our belief that the best features are those that feel like natural extensions of existing workflows rather than additional complexity. When users select text and see the quick chat dialog appear exactly where they need it, with their selection still highlighted and the AI ready to help, the feature doesn't feel like a "feature" at all—it feels like the way things should work.

---

*This blog post documents the development of the contextual quick chat feature in ChatOllama, implemented on September 11, 2025. The feature brings AI IDE-style contextual assistance to web-based chat applications, solving complex technical challenges around text selection persistence and model consistency.*

**Technical Stack**: Vue 3 + Nuxt 3 + TypeScript + Streaming APIs + Advanced DOM Manipulation

**Project Repository**: [ChatOllama](https://github.com/sugarforever/chat-ollama)

**Feature Components**:
- `components/QuickChat.vue`
- `composables/useQuickChat.ts`
- `composables/useTextSelection.ts`