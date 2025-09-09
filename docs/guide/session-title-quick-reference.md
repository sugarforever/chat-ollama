# Session Title Generation - Quick Reference

## 🚀 Quick Start

### Auto-generate on first message (most common):

```typescript
import { createAutoTitleGenerator } from '~/utils/autoTitleGeneration'

const autoTitleGenerator = createAutoTitleGenerator.forFirstMessage((title) => {
  sessionInfo.value.title = title
  emit('title-updated', title)
})

// In your message handler:
autoTitleGenerator.attemptTitleGeneration(context, sessionId, model, family)
```

## 📖 Common Patterns

### Manual Title Generation

```typescript
import { useSessionTitle } from '~/composables/useSessionTitle'

const { generateSessionTitle } = useSessionTitle()

const title = await generateSessionTitle({
  sessionId: 123,
  model: 'gpt-4',
  family: 'OpenAI',
  userMessage: 'Your message here',
  style: 'descriptive', // 'concise' | 'descriptive' | 'technical' | 'casual'
  maxWords: 6
})
```

### Custom Trigger

```typescript
import { useSessionTitle } from '~/composables/useSessionTitle'

const customTrigger = {
  shouldGenerate: (context) => context.messageCount === 3,
  extractMessage: (context) => context.lastMessage
}

const { generateTitleWithTrigger } = useSessionTitle()
await generateTitleWithTrigger(customTrigger, context, model, family, sessionId)
```

## 🔧 Configuration

### API Request Options

```typescript
{
  sessionId: number,
  model: string,
  family: string,
  userMessage: string,
  
  // Optional
  autoUpdate?: boolean,        // Auto-save to DB (default: true)
  style?: string,             // 'concise' | 'descriptive' | 'technical' | 'casual'
  maxWords?: number,          // Default: 6
  systemPrompt?: string,      // Custom prompt override
  onSuccess?: (title) => void,
  onError?: (error) => void
}
```

### Pre-built Triggers

```typescript
import { titleTriggers } from '~/composables/useSessionTitle'

// Generate on first user message (if no existing title)
titleTriggers.firstUserMessage

// Always generate when called
titleTriggers.onDemand
```

## 🎯 Use Cases

| Scenario | Solution |
|----------|----------|
| Auto-title new chats | `createAutoTitleGenerator.forFirstMessage()` |
| Manual title refresh | `generateSessionTitle({ ... })` |
| Document summarization | `generateSessionTitle({ autoUpdate: false })` |
| Custom conditions | Custom trigger with `generateTitleWithTrigger()` |
| Batch processing | `generateTitleAPI()` for raw API calls |

## 🔍 Debug Checklist

- ✅ Model and family are correct
- ✅ Session has valid ID  
- ✅ User message is not empty
- ✅ Trigger conditions are met
- ✅ API keys are configured
- ✅ Callbacks are connected
- ✅ Check browser console for errors

## 📝 Title Styles

| Style | Example Output |
|-------|---------------|
| `concise` | "Quantum Computing" |
| `descriptive` | "Introduction to Quantum Computing Principles" |
| `technical` | "Quantum Superposition and Entanglement Theory" |
| `casual` | "Learning About Quantum Stuff" |

## 🏗️ Architecture

```
Component → AutoTitleGenerator → useSessionTitle() → API → LLM → Response
    ↓              ↓                    ↓           ↓      ↓        ↓
   UI Update    Trigger Logic    DB Update    HTTP Request  Title Generation
```

## 📦 Imports

```typescript
// Main composable
import { useSessionTitle, titleTriggers } from '~/composables/useSessionTitle'

// Auto generator utility
import { createAutoTitleGenerator } from '~/utils/autoTitleGeneration'

// Types (if needed)
import type { 
  SessionTitleOptions, 
  SessionTitleTrigger 
} from '~/composables/useSessionTitle'
```

## 🔗 API Endpoint

**POST** `/api/sessions/:sessionId/title`

```json
{
  "model": "gpt-4",
  "family": "OpenAI", 
  "userMessage": "Tell me about AI",
  "style": "concise",
  "maxWords": 6
}
```

Response:
```json
{
  "title": "AI Fundamentals Discussion"
}
```