# Session Title Generation Developer Guide

## Overview

The session title generation system automatically creates meaningful titles for chat sessions based on user messages. The system is designed to be **modular**, **configurable**, and **reusable** across different components and scenarios.

## Architecture

### Components

```
┌─────────────────────────┐    ┌─────────────────────────┐
│   Chat Component        │    │  Other Components       │
│                         │    │  (Future integrations) │
└───────────┬─────────────┘    └───────────┬─────────────┘
            │                              │
            └──────────────┬───────────────┘
                           │
                           v
              ┌─────────────────────────┐
              │  AutoTitleGenerator     │
              │  (utils/autoTitle...)   │
              └───────────┬─────────────┘
                          │
                          v
              ┌─────────────────────────┐
              │  useSessionTitle()      │
              │  (composables/)         │
              └───────────┬─────────────┘
                          │
                          v
              ┌─────────────────────────┐
              │  API Endpoint           │
              │  /api/sessions/*/title  │
              └─────────────────────────┘
```

## Quick Start

### Basic Usage (Most Common)

For typical chat applications that want to auto-generate titles on the first user message:

```vue
<!-- components/YourChatComponent.vue -->
<script setup>
import { createAutoTitleGenerator } from '~/utils/autoTitleGeneration'

// Setup auto title generation
const autoTitleGenerator = createAutoTitleGenerator.forFirstMessage((title) => {
  // Update your UI when title is generated
  if (sessionInfo.value) {
    sessionInfo.value.title = title
    emit('title-updated', title)
  }
})

// In your message handler
const onSendMessage = async (messageContent) => {
  // ... your existing message logic ...
  
  // Auto-generate title if conditions are met
  if (sessionInfo.value && models.value.length > 0) {
    const { family, name: model } = parseModelValue(models.value[0])
    
    autoTitleGenerator.attemptTitleGeneration(
      {
        messages: messages.value,
        sessionTitle: sessionInfo.value.title,
        messageContent: messageContent
      },
      sessionInfo.value.id,
      model,
      family
    )
  }
}
</script>
```

## Advanced Usage

### Custom Triggers

Create custom logic for when titles should be generated:

```typescript
import { useSessionTitle, type SessionTitleTrigger } from '~/composables/useSessionTitle'

// Custom trigger for specific scenarios
const customTrigger: SessionTitleTrigger = {
  shouldGenerate: (context) => {
    // Your custom logic
    return context.messageCount > 3 && !context.hasTitle
  },
  extractMessage: (context) => {
    // Extract relevant content for title generation
    return context.lastUserMessage
  }
}

const { generateTitleWithTrigger } = useSessionTitle()

await generateTitleWithTrigger(
  customTrigger,
  context,
  model,
  family,
  sessionId,
  {
    onSuccess: (title) => console.log('Generated:', title),
    onError: (error) => console.error('Failed:', error)
  }
)
```

### Direct API Usage

For complete control over the title generation process:

```typescript
import { useSessionTitle } from '~/composables/useSessionTitle'

const { generateSessionTitle } = useSessionTitle()

const title = await generateSessionTitle({
  sessionId: 123,
  model: 'gpt-4',
  family: 'OpenAI',
  userMessage: 'Tell me about quantum computing',
  autoUpdate: true, // Auto-save to database
  style: 'technical', // Use technical prompt style
  maxWords: 8,
  onSuccess: (title) => {
    console.log('Title generated:', title)
  },
  onError: (error) => {
    console.error('Generation failed:', error)
  }
})
```

## Configuration Options

### Title Styles

The API endpoint supports different prompt styles:

| Style | Description | Example Output |
|-------|-------------|----------------|
| `concise` | Short and to the point | "Quantum Computing Basics" |
| `descriptive` | More detailed description | "Understanding Quantum Computing Principles" |
| `technical` | Technical terminology focus | "Quantum Superposition and Entanglement" |
| `casual` | Friendly, conversational tone | "Learning About Quantum Stuff" |

### AutoTitleGenerator Options

```typescript
const generator = new AutoTitleGenerator({
  enabled: true, // Enable/disable generation
  trigger: customTrigger, // When to generate
  onTitleGenerated: (title, sessionId) => {
    // Called when title is successfully generated
  },
  onError: (error, sessionId) => {
    // Called when generation fails
  }
})

// Update configuration later
generator.updateConfig({
  enabled: userPreferences.autoTitleGeneration
})
```

## Pre-built Triggers

### `titleTriggers.firstUserMessage`

Generates title when:
- Session has no title or empty title
- User sends their first message

```typescript
import { titleTriggers } from '~/composables/useSessionTitle'

const shouldGenerate = titleTriggers.firstUserMessage.shouldGenerate({
  messages: chatMessages,
  sessionTitle: currentTitle
})
```

### `titleTriggers.onDemand`

Always generates when called (no conditions):

```typescript
import { titleTriggers } from '~/composables/useSessionTitle'

// Always returns true
const shouldGenerate = titleTriggers.onDemand.shouldGenerate(context)
```

## API Reference

### `useSessionTitle()`

#### Methods

##### `generateSessionTitle(options: SessionTitleOptions)`

Main function for generating titles with full control.

**Options:**
```typescript
interface SessionTitleOptions {
  sessionId: number
  model: string
  family: string  
  userMessage: string
  autoUpdate?: boolean // Default: true
  onSuccess?: (title: string) => void
  onError?: (error: any) => void
  style?: 'concise' | 'descriptive' | 'technical' | 'casual'
  maxWords?: number // Default: 6
  systemPrompt?: string // Custom prompt override
}
```

##### `generateTitleWithTrigger(trigger, context, model, family, sessionId, options?)`

Smart generation that only runs when trigger conditions are met.

##### `generateTitleAPI(model, family, userMessage, sessionId)`

Low-level API call function (just makes the HTTP request).

##### `updateSessionInDB(sessionId, title)`

Updates the local database with the new title.

### API Endpoint

**POST** `/api/sessions/:sessionId/title`

**Request Body:**
```typescript
{
  model: string
  family: string
  userMessage: string
  systemPrompt?: string // Custom prompt
  maxWords?: number // Default: 6
  style?: 'concise' | 'descriptive' | 'technical' | 'casual'
}
```

**Response:**
```typescript
{
  title: string
}
```

## Integration Examples

### For Document Summarization

```typescript
const { generateSessionTitle } = useSessionTitle()

const summarizeDocument = async (docId: number, content: string) => {
  const title = await generateSessionTitle({
    sessionId: docId,
    model: 'gpt-4',
    family: 'OpenAI',
    userMessage: content,
    style: 'descriptive',
    maxWords: 10,
    autoUpdate: false // Don't auto-save for docs
  })
  
  // Handle the title manually
  await updateDocumentTitle(docId, title)
}
```

### For Chat Session Settings

```typescript
// Allow users to regenerate titles
const regenerateTitle = async () => {
  const lastUserMessage = messages.value
    .filter(m => m.role === 'user')
    .pop()?.content
    
  if (lastUserMessage) {
    const { generateSessionTitle } = useSessionTitle()
    const newTitle = await generateSessionTitle({
      sessionId: currentSessionId,
      model: selectedModel,
      family: selectedFamily,
      userMessage: lastUserMessage,
      style: userPreferences.titleStyle
    })
    
    if (newTitle) {
      updateUI(newTitle)
    }
  }
}
```

### For Batch Processing

```typescript
const { generateTitleAPI } = useSessionTitle()

const processSessions = async (sessions: Session[]) => {
  const results = await Promise.allSettled(
    sessions.map(session => 
      generateTitleAPI(
        session.model,
        session.family,
        session.firstMessage,
        session.id
      )
    )
  )
  
  // Handle results...
}
```

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```typescript
const generator = createAutoTitleGenerator.forFirstMessage(
  (title) => updateUI(title),
  (error) => {
    console.warn('Title generation failed:', error)
    // Don't break the user experience
  }
)
```

### 2. Performance

- Title generation runs asynchronously and doesn't block the UI
- Failed generations are logged but don't affect chat functionality
- Consider debouncing for rapid message scenarios

### 3. User Experience

```typescript
// Show loading state while generating
const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)

const generator = createAutoTitleGenerator.forFirstMessage(
  (title) => {
    updateUI(title)
    setIsGeneratingTitle(false)
  }
)

// Before generation
setIsGeneratingTitle(true)
```

### 4. Configuration

Make title generation user-configurable:

```typescript
// In user settings
const titleSettings = {
  enabled: true,
  style: 'descriptive',
  maxWords: 8,
  autoGenerate: true
}

// Apply to generator
generator.updateConfig({
  enabled: titleSettings.enabled
})
```

## Testing

### Unit Tests

```typescript
import { titleTriggers } from '~/composables/useSessionTitle'

describe('Title Triggers', () => {
  it('should generate on first user message', () => {
    const context = {
      messages: [{ role: 'user', content: 'Hello' }],
      sessionTitle: ''
    }
    
    const shouldGenerate = titleTriggers.firstUserMessage.shouldGenerate(context)
    expect(shouldGenerate).toBe(true)
  })
})
```

### Integration Tests

```typescript
import { useSessionTitle } from '~/composables/useSessionTitle'

describe('Session Title Generation', () => {
  it('should generate and save title', async () => {
    const { generateSessionTitle } = useSessionTitle()
    
    const title = await generateSessionTitle({
      sessionId: 1,
      model: 'test-model',
      family: 'OpenAI',
      userMessage: 'Test message',
      autoUpdate: false
    })
    
    expect(title).toBeTruthy()
  })
})
```

## Troubleshooting

### Common Issues

1. **Title not generating**
   - Check that the trigger conditions are met
   - Verify model and family are correct
   - Check browser console for errors

2. **API errors**
   - Ensure the model provider is properly configured
   - Check API keys and endpoints
   - Verify the request headers include authentication

3. **UI not updating**
   - Make sure callbacks are properly connected
   - Check that session info is reactive
   - Verify event emissions are handled

### Debug Mode

Enable debugging by adding logs:

```typescript
const generator = createAutoTitleGenerator.forFirstMessage(
  (title) => {
    console.log('Title generated:', title)
    updateUI(title)
  },
  (error) => {
    console.error('Title generation error:', error)
  }
)
```

## Migration Guide

### From Old System

If upgrading from a previous title generation system:

1. Replace old imports:
   ```typescript
   // Old
   import { generateSessionTitle } from '~/composables/useGenerateSessionTitle'
   
   // New
   import { createAutoTitleGenerator } from '~/utils/autoTitleGeneration'
   ```

2. Update component logic:
   ```typescript
   // Old
   if (firstMessage) {
     generateSessionTitle(sessionId, model, family, message)
   }
   
   // New
   const generator = createAutoTitleGenerator.forFirstMessage(onTitleGenerated)
   generator.attemptTitleGeneration(context, sessionId, model, family)
   ```

3. Handle configuration:
   ```typescript
   // Old
   const title = await generateSessionTitle(sessionId, model, family, message)
   
   // New
   const { generateSessionTitle } = useSessionTitle()
   const title = await generateSessionTitle({
     sessionId,
     model,
     family,
     userMessage: message,
     style: 'concise'
   })
   ```

---

## Contributing

When extending the title generation system:

1. **Adding new triggers**: Extend `titleTriggers` object
2. **Adding new styles**: Update `TITLE_PROMPTS` in the API endpoint
3. **Adding new features**: Follow the separation of concerns principle
4. **Testing**: Add tests for new functionality
5. **Documentation**: Update this guide with new features

For questions or contributions, please refer to the main project documentation.