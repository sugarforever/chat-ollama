# Canvas Feature Design Document

## Overview

The Canvas feature creates a revolutionary canvas-centric collaborative platform where users work with AI to create any type of digital content in real-time. The design prioritizes the canvas as the primary interface element (70-80% of screen space) with AI chat as a supporting tool via floating dialog or side panel. The system enables seamless collaboration for building anything from documents and diagrams to websites and interactive prototypes, with live preview and instant iteration capabilities.

## Architecture

### Frontend Architecture

```
Canvas-Centric Application
├── Pages
│   ├── /canvas (Canvas Dashboard)
│   └── /canvas/[id] (Canvas Workspace)
├── Layouts
│   └── canvas.vue (Canvas-focused layout)
├── Components
│   ├── Canvas/
│   │   ├── CanvasDashboard.vue (Canvas library/management)
│   │   ├── CanvasWorkspace.vue (Main canvas-centric interface)
│   │   ├── ContentRenderer.vue (Flexible content preview/rendering)
│   │   ├── ContentEditor.vue (Adaptive content editing)
│   │   ├── FloatingChat.vue (Floating AI chat dialog)
│   │   ├── SideChat.vue (Narrow side panel chat)
│   │   ├── CanvasToolbar.vue (Canvas controls and actions)
│   │   └── ShareDialog.vue (Canvas sharing interface)
│   ├── AI/
│   │   ├── AICollaborator.vue (AI interaction manager)
│   │   ├── ContextAnalyzer.vue (Canvas context understanding)
│   │   └── ProgressIndicator.vue (AI work progress)
│   └── Shared/
│       ├── ResponsivePreview.vue (Device preview modes)
│       └── ErrorBoundary.vue (Error handling)
├── Composables
│   ├── useCanvasWorkspace.ts (Canvas-centric state management)
│   ├── useContentRenderer.ts (Flexible content rendering)
│   ├── useAICollaboration.ts (AI interaction and context)
│   ├── useCanvasChat.ts (Chat interface management)
│   └── useCanvasSharing.ts (Sharing and export)
└── Utils
    ├── contentRenderers.ts (Multiple content type renderers)
    ├── contentValidators.ts (Content validation and sanitization)
    └── contextExtractor.ts (Canvas context analysis)
```

### Backend Architecture

```
API Layer
├── /api/canvas
│   ├── GET /api/canvas (list user canvases)
│   ├── POST /api/canvas (create new canvas)
│   ├── GET /api/canvas/[id] (get canvas with content)
│   ├── PUT /api/canvas/[id] (update canvas metadata)
│   └── DELETE /api/canvas/[id] (delete canvas)
├── /api/canvas/[id]/content
│   ├── GET (get current canvas content)
│   ├── PUT (update canvas content - HTML/CSS/JS)
│   └── POST /preview (generate safe preview)
├── /api/canvas/[id]/collaborate
│   ├── POST (AI collaboration with context)
│   ├── POST /apply-changes (apply AI-generated changes)
│   └── GET /context (get canvas context for AI)
├── /api/canvas/[id]/share
│   ├── POST (create shareable link)
│   ├── GET /[shareId] (get shared canvas - public)
│   └── DELETE /[shareId] (revoke sharing)
└── /api/canvas/[id]/versions
    ├── GET (list canvas versions)
    ├── POST (save current version)
    └── POST /[versionId]/restore (restore version)
```

## Components and Interfaces

### Core Data Models

```typescript
interface Canvas {
  id: string
  title: string
  type: CanvasType
  userId: number
  createdAt: Date
  updatedAt: Date
  lastModified: Date
  content: CanvasContent
  metadata: CanvasMetadata
  sharing?: SharingSettings
  versions: CanvasVersion[]
}

interface CanvasContent {
  type: ContentType
  data: any // Flexible content data based on type
  rawContent?: string // Raw text/code when applicable
  assets?: CanvasAsset[]
  dependencies?: string[] // External libraries/resources
}

enum ContentType {
  DOCUMENT = 'document', // Markdown, rich text
  DIAGRAM = 'diagram', // Mermaid, PlantUML, SVG
  WEB_PAGE = 'web_page', // HTML/CSS/JS
  PRESENTATION = 'presentation', // Slide-based content
  DESIGN = 'design', // Visual design, mockups
  PROTOTYPE = 'prototype', // Interactive prototypes
  VISUALIZATION = 'visualization', // Charts, graphs
  CREATIVE = 'creative' // Art, creative content
}

interface CanvasMetadata {
  description?: string
  tags?: string[]
  thumbnail?: string // Base64 or URL to preview image
  isPublic: boolean
  collaborationHistory: CollaborationEntry[]
}

interface CollaborationEntry {
  id: string
  timestamp: Date
  type: 'USER_MESSAGE' | 'AI_RESPONSE' | 'CONTENT_CHANGE' | 'PREVIEW_UPDATE' | 'SUGGESTION'
  content: string
  changes?: ContentChange[]
}

interface ContentChange {
  contentType: ContentType
  operation: 'create' | 'update' | 'delete' | 'transform'
  target?: string // element, section, or component identifier
  before?: any
  after?: any
  description?: string // Human-readable description of the change
}

interface SharingSettings {
  isShared: boolean
  shareId?: string
  shareUrl?: string
  allowComments?: boolean
  expiresAt?: Date
}

interface CanvasAsset {
  id: string
  name: string
  type: 'image' | 'font' | 'data'
  url: string
  size: number
}

enum CanvasType {
  WEB_PAGE = 'WEB_PAGE',
  INTERACTIVE_DEMO = 'INTERACTIVE_DEMO',
  PROTOTYPE = 'PROTOTYPE',
  PRESENTATION = 'PRESENTATION',
  GAME = 'GAME',
  VISUALIZATION = 'VISUALIZATION'
}
```

### Component Interfaces

```typescript
// CanvasWorkspace.vue - Main canvas-centric interface
interface CanvasWorkspaceProps {
  canvasId: string
}

interface CanvasWorkspaceEmits {
  'canvas-updated': [canvas: Canvas]
  'content-changed': [content: CanvasContent]
  'collaboration-event': [event: CollaborationEntry]
}

// LivePreview.vue - Real-time HTML/CSS/JS preview
interface LivePreviewProps {
  content: CanvasContent
  deviceMode: 'desktop' | 'tablet' | 'mobile'
  isInteractive: boolean
}

interface LivePreviewEmits {
  'preview-ready': []
  'preview-error': [error: PreviewError]
  'user-interaction': [event: InteractionEvent]
}

// FloatingChat.vue - Floating AI chat dialog
interface FloatingChatProps {
  canvasId: string
  canvasContext: CanvasContext
  isMinimized: boolean
  position: { x: number; y: number }
}

interface FloatingChatEmits {
  'message-sent': [message: string]
  'ai-response': [response: AIResponse]
  'minimize': []
  'close': []
  'position-changed': [position: { x: number; y: number }]
}

// AICollaborator.vue - AI interaction manager
interface AICollaboratorProps {
  canvasId: string
  canvasContent: CanvasContent
  collaborationHistory: CollaborationEntry[]
}

interface AICollaboratorEmits {
  'changes-proposed': [changes: CodeChange[]]
  'changes-applied': [changes: CodeChange[]]
  'context-updated': [context: CanvasContext]
}

// Canvas Context for AI understanding
interface CanvasContext {
  currentContent: CanvasContent
  recentChanges: CodeChange[]
  userIntent: string
  technicalContext: {
    frameworks: string[]
    libraries: string[]
    complexity: 'simple' | 'moderate' | 'complex'
  }
  visualContext: {
    layout: string
    colorScheme: string
    components: string[]
  }
}
```

### Composables Design

```typescript
// useCanvasWorkspace.ts - Main canvas workspace management
export function useCanvasWorkspace(canvasId: string) {
  const canvas = ref<Canvas | null>(null)
  const content = ref<CanvasContent>({ html: '', css: '', javascript: '' })
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isDirty = ref(false)

  const loadCanvas = async () => { /* implementation */ }
  const saveCanvas = async () => { /* implementation */ }
  const updateContent = async (newContent: Partial<CanvasContent>) => { /* implementation */ }
  const autoSave = debounce(saveCanvas, 2000)

  // Watch for content changes and trigger auto-save
  watch(content, () => {
    isDirty.value = true
    autoSave()
  }, { deep: true })

  return {
    canvas: readonly(canvas),
    content,
    isLoading: readonly(isLoading),
    error: readonly(error),
    isDirty: readonly(isDirty),
    loadCanvas,
    saveCanvas,
    updateContent
  }
}

// useLivePreview.ts - Real-time preview management
export function useLivePreview(content: Ref<CanvasContent>) {
  const previewRef = ref<HTMLIFrameElement>()
  const isReady = ref(false)
  const error = ref<PreviewError | null>(null)
  const deviceMode = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

  const updatePreview = async () => {
    if (!previewRef.value) return
    
    const doc = previewRef.value.contentDocument
    if (!doc) return

    try {
      // Create complete HTML document
      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${content.value.css}</style>
          </head>
          <body>
            ${content.value.html}
            <script>${content.value.javascript}</script>
          </body>
        </html>
      `
      
      doc.open()
      doc.write(fullHtml)
      doc.close()
      
      isReady.value = true
      error.value = null
    } catch (err) {
      error.value = { type: 'RENDER_ERROR', message: err.message }
    }
  }

  // Watch for content changes and update preview
  watch(content, updatePreview, { deep: true, immediate: true })

  const setDeviceMode = (mode: 'desktop' | 'tablet' | 'mobile') => {
    deviceMode.value = mode
    // Update iframe dimensions based on device mode
  }

  return {
    previewRef,
    isReady: readonly(isReady),
    error: readonly(error),
    deviceMode: readonly(deviceMode),
    updatePreview,
    setDeviceMode
  }
}

// useAICollaboration.ts - AI interaction and context management
export function useAICollaboration(canvasId: string, content: Ref<CanvasContent>) {
  const isCollaborating = ref(false)
  const collaborationHistory = ref<CollaborationEntry[]>([])
  const pendingChanges = ref<CodeChange[]>([])
  const context = ref<CanvasContext | null>(null)

  const sendMessage = async (message: string) => {
    isCollaborating.value = true
    
    try {
      // Add user message to history
      const userEntry: CollaborationEntry = {
        id: generateId(),
        timestamp: new Date(),
        type: 'USER_MESSAGE',
        content: message
      }
      collaborationHistory.value.push(userEntry)

      // Get current canvas context
      const currentContext = await extractCanvasContext(content.value)
      context.value = currentContext

      // Send to AI with context
      const response = await $fetch(`/api/canvas/${canvasId}/collaborate`, {
        method: 'POST',
        body: {
          message,
          context: currentContext,
          history: collaborationHistory.value.slice(-10) // Last 10 entries
        }
      })

      // Add AI response to history
      const aiEntry: CollaborationEntry = {
        id: generateId(),
        timestamp: new Date(),
        type: 'AI_RESPONSE',
        content: response.message,
        changes: response.changes
      }
      collaborationHistory.value.push(aiEntry)

      // Store pending changes for user approval
      if (response.changes?.length > 0) {
        pendingChanges.value = response.changes
      }

      return response
    } finally {
      isCollaborating.value = false
    }
  }

  const applyChanges = async (changes: CodeChange[]) => {
    // Apply changes to content
    for (const change of changes) {
      if (change.type === 'html') {
        content.value.html = change.after || ''
      } else if (change.type === 'css') {
        content.value.css = change.after || ''
      } else if (change.type === 'javascript') {
        content.value.javascript = change.after || ''
      }
    }

    // Clear pending changes
    pendingChanges.value = []

    // Add to collaboration history
    const changeEntry: CollaborationEntry = {
      id: generateId(),
      timestamp: new Date(),
      type: 'CODE_CHANGE',
      content: 'Changes applied',
      changes
    }
    collaborationHistory.value.push(changeEntry)
  }

  const rejectChanges = () => {
    pendingChanges.value = []
  }

  return {
    isCollaborating: readonly(isCollaborating),
    collaborationHistory: readonly(collaborationHistory),
    pendingChanges: readonly(pendingChanges),
    context: readonly(context),
    sendMessage,
    applyChanges,
    rejectChanges
  }
}

// useCanvasChat.ts - Chat interface management
export function useCanvasChat() {
  const chatMode = ref<'floating' | 'sidebar' | 'hidden'>('floating')
  const isMinimized = ref(false)
  const position = ref({ x: 20, y: 20 })
  const messages = ref<ChatMessage[]>([])

  const toggleMode = () => {
    const modes = ['floating', 'sidebar', 'hidden'] as const
    const currentIndex = modes.indexOf(chatMode.value)
    chatMode.value = modes[(currentIndex + 1) % modes.length]
  }

  const minimize = () => {
    isMinimized.value = true
  }

  const restore = () => {
    isMinimized.value = false
  }

  const updatePosition = (newPosition: { x: number; y: number }) => {
    position.value = newPosition
  }

  return {
    chatMode,
    isMinimized,
    position,
    messages,
    toggleMode,
    minimize,
    restore,
    updatePosition
  }
}
```

## Data Models

### Database Schema Updates

Updated Prisma schema for canvas-centric collaboration:

```prisma
model Canvas {
  id              String             @id @default(cuid())
  title           String
  type            CanvasType
  userId          Int                @map("user_id")
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")
  lastModified    DateTime           @default(now()) @map("last_modified")
  
  // Canvas content (HTML/CSS/JS)
  htmlContent     String             @default("") @map("html_content") @db.Text
  cssContent      String             @default("") @map("css_content") @db.Text
  jsContent       String             @default("") @map("js_content") @db.Text
  
  // Metadata
  description     String?
  tags            String[]           @default([])
  thumbnail       String?            // Base64 preview image
  isPublic        Boolean            @default(false) @map("is_public")
  
  // Relationships
  user            User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions        CanvasVersion[]
  collaborations  CanvasCollaboration[]
  shares          CanvasShare[]
  assets          CanvasAsset[]

  @@map("canvases")
}

model CanvasVersion {
  id              String    @id @default(cuid())
  canvasId        String    @map("canvas_id")
  versionNumber   Int       @map("version_number")
  description     String?
  
  // Snapshot of content at this version
  htmlContent     String    @map("html_content") @db.Text
  cssContent      String    @map("css_content") @db.Text
  jsContent       String    @map("js_content") @db.Text
  
  createdAt       DateTime  @default(now()) @map("created_at")
  
  canvas          Canvas    @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@unique([canvasId, versionNumber])
  @@map("canvas_versions")
}

model CanvasCollaboration {
  id              String                @id @default(cuid())
  canvasId        String                @map("canvas_id")
  type            CollaborationType
  content         String                @db.Text
  changes         Json?                 // CodeChange[]
  createdAt       DateTime              @default(now()) @map("created_at")
  
  canvas          Canvas                @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@map("canvas_collaborations")
}

model CanvasShare {
  id              String    @id @default(cuid())
  canvasId        String    @map("canvas_id")
  shareId         String    @unique @map("share_id")
  isActive        Boolean   @default(true) @map("is_active")
  allowComments   Boolean   @default(false) @map("allow_comments")
  expiresAt       DateTime? @map("expires_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  
  canvas          Canvas    @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@map("canvas_shares")
}

model CanvasAsset {
  id              String    @id @default(cuid())
  canvasId        String    @map("canvas_id")
  name            String
  type            AssetType
  url             String
  size            Int       // Size in bytes
  createdAt       DateTime  @default(now()) @map("created_at")
  
  canvas          Canvas    @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@map("canvas_assets")
}

enum CanvasType {
  WEB_PAGE
  INTERACTIVE_DEMO
  PROTOTYPE
  PRESENTATION
  GAME
  VISUALIZATION
}

enum CollaborationType {
  USER_MESSAGE
  AI_RESPONSE
  CODE_CHANGE
  PREVIEW_UPDATE
}

enum AssetType {
  IMAGE
  FONT
  DATA
  LIBRARY
}
```

### API Response Formats

```typescript
// GET /api/canvas
interface CanvasListResponse {
  canvases: CanvasSummary[]
}

interface CanvasSummary {
  id: string
  title: string
  type: CanvasType
  description?: string
  thumbnail?: string
  lastModified: Date
  isPublic: boolean
  versionCount: number
}

// GET /api/canvas/[id]
interface CanvasDetailResponse {
  canvas: Canvas
  content: CanvasContent
  versions: CanvasVersion[]
  collaborationHistory: CollaborationEntry[]
}

// POST /api/canvas/[id]/collaborate
interface AICollaborationRequest {
  message: string
  context: CanvasContext
  history: CollaborationEntry[]
}

interface AICollaborationResponse {
  message: string
  changes?: CodeChange[]
  suggestions?: string[]
  explanation?: string
}

// PUT /api/canvas/[id]/content
interface UpdateContentRequest {
  html?: string
  css?: string
  javascript?: string
  autoSave?: boolean
}

interface UpdateContentResponse {
  success: boolean
  version?: number
  lastModified: Date
}

// POST /api/canvas/[id]/share
interface CreateShareRequest {
  allowComments?: boolean
  expiresAt?: Date
}

interface CreateShareResponse {
  shareId: string
  shareUrl: string
  expiresAt?: Date
}

// GET /api/canvas/share/[shareId] - Public endpoint
interface SharedCanvasResponse {
  canvas: {
    id: string
    title: string
    type: CanvasType
    description?: string
    createdAt: Date
  }
  content: CanvasContent
  isActive: boolean
}
```

## Error Handling

### Canvas-Specific Error Handling

The canvas-centric design requires robust error handling for real-time collaboration and live preview:

```typescript
// Preview Error Handling
interface PreviewError {
  type: 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | 'SECURITY_ERROR' | 'RENDER_ERROR'
  message: string
  line?: number
  column?: number
  source?: 'html' | 'css' | 'javascript'
}

// Safe Code Execution
export function createSafePreview(content: CanvasContent): string {
  try {
    // Sanitize HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(content.html, {
      allowedTags: [...allowedHtmlTags],
      allowedAttributes: {...allowedAttributes}
    })

    // Validate CSS for dangerous properties
    const safeCss = validateCss(content.css)

    // Sandbox JavaScript execution
    const sandboxedJs = wrapInSandbox(content.javascript)

    return createPreviewDocument(sanitizedHtml, safeCss, sandboxedJs)
  } catch (error) {
    throw new PreviewError({
      type: 'RENDER_ERROR',
      message: error.message
    })
  }
}

// AI Collaboration Error Handling
export function handleCollaborationError(error: any): CollaborationError {
  if (error.statusCode === 429) {
    return {
      type: 'RATE_LIMIT',
      message: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: error.retryAfter
    }
  }
  
  if (error.statusCode === 400) {
    return {
      type: 'INVALID_REQUEST',
      message: 'Unable to understand the request. Please try rephrasing.',
      suggestions: ['Be more specific about what you want to change', 'Refer to specific elements in your canvas']
    }
  }
  
  return {
    type: 'UNKNOWN',
    message: 'Something went wrong. Please try again.',
    canRetry: true
  }
}
```

### Error Handling Strategy

```typescript
// Global error handling for canvas operations
export function useCanvasErrorHandler() {
  const handleError = (error: any, operation: string) => {
    console.error(`Canvas ${operation} failed:`, error)
    
    // User-friendly error messages
    const errorMessages = {
      'NETWORK_ERROR': 'Network connection failed. Please check your internet connection.',
      'UNAUTHORIZED': 'You need to be logged in to perform this action.',
      'FORBIDDEN': 'You don\'t have permission to access this canvas.',
      'NOT_FOUND': 'Canvas not found. It may have been deleted.',
      'VALIDATION_ERROR': 'Invalid data provided. Please check your input.',
      'SERVER_ERROR': 'Server error occurred. Please try again later.'
    }
    
    const userMessage = errorMessages[error.statusCode] || 'An unexpected error occurred.'
    
    // Show user notification
    useNotification().error(userMessage)
    
    return { error: userMessage, handled: true }
  }
  
  return { handleError }
}
```

## Canvas Layout Design

### Canvas-Centric Interface Layout

```typescript
// Canvas Workspace Layout (canvas/[id].vue)
interface CanvasLayout {
  canvas: {
    width: '70-80%'  // Primary focus area
    position: 'center'
    components: ['LivePreview', 'CodeEditor', 'DeviceToggle']
  }
  chat: {
    mode: 'floating' | 'sidebar' | 'hidden'
    width: '300px' // When in sidebar mode
    position: 'right' // Sidebar position
    floating: {
      width: '400px'
      height: '500px'
      draggable: true
      resizable: true
    }
  }
  toolbar: {
    position: 'top'
    height: '60px'
    components: ['CanvasTitle', 'ShareButton', 'VersionControl', 'ChatToggle']
  }
}

// Responsive Breakpoints
const breakpoints = {
  mobile: '< 768px',    // Stack vertically, hide sidebar
  tablet: '768-1024px', // Reduce canvas to 60%, sidebar 40%
  desktop: '> 1024px'   // Full canvas-centric layout
}
```

### Chat Interface Modes

```typescript
// Floating Chat Dialog
interface FloatingChatConfig {
  defaultPosition: { x: 20, y: 100 }
  minSize: { width: 300, height: 400 }
  maxSize: { width: 600, height: 800 }
  isDraggable: true
  isResizable: true
  canMinimize: true
  zIndex: 1000
}

// Sidebar Chat Panel
interface SidebarChatConfig {
  width: 300 // Fixed width
  position: 'right'
  collapsible: true
  minWidth: 250
  maxWidth: 400
}

// Chat State Management
export function useChatLayout() {
  const mode = useLocalStorage('canvas-chat-mode', 'floating')
  const floatingPosition = useLocalStorage('canvas-chat-position', { x: 20, y: 100 })
  const sidebarWidth = useLocalStorage('canvas-sidebar-width', 300)
  
  return {
    mode,
    floatingPosition,
    sidebarWidth,
    toggleMode: () => {
      mode.value = mode.value === 'floating' ? 'sidebar' : 'floating'
    }
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
// tests/composables/useCanvasWorkspace.test.ts
describe('useCanvasWorkspace', () => {
  it('should load canvas content successfully', async () => {
    const { loadCanvas, canvas, content } = useCanvasWorkspace('test-id')
    await loadCanvas()
    expect(canvas.value).toBeTruthy()
    expect(content.value.html).toBeDefined()
  })
  
  it('should auto-save content changes', async () => {
    const { content, isDirty } = useCanvasWorkspace('test-id')
    content.value.html = '<h1>Test</h1>'
    expect(isDirty.value).toBe(true)
    // Wait for debounced auto-save
    await new Promise(resolve => setTimeout(resolve, 2100))
    expect(isDirty.value).toBe(false)
  })
})

// tests/composables/useLivePreview.test.ts
describe('useLivePreview', () => {
  it('should update preview when content changes', async () => {
    const content = ref({ html: '<h1>Hello</h1>', css: '', javascript: '' })
    const { updatePreview, isReady } = useLivePreview(content)
    
    await updatePreview()
    expect(isReady.value).toBe(true)
  })
  
  it('should handle preview errors gracefully', async () => {
    const content = ref({ html: '<invalid>', css: '', javascript: '' })
    const { updatePreview, error } = useLivePreview(content)
    
    await updatePreview()
    expect(error.value).toBeTruthy()
  })
})

// tests/components/FloatingChat.test.ts
describe('FloatingChat', () => {
  it('should render in floating mode', () => {
    const wrapper = mount(FloatingChat, {
      props: {
        canvasId: 'test-id',
        canvasContext: mockContext,
        isMinimized: false,
        position: { x: 20, y: 20 }
      }
    })
    expect(wrapper.classes()).toContain('floating-chat')
  })
  
  it('should emit position changes when dragged', async () => {
    const wrapper = mount(FloatingChat, { props: mockProps })
    // Simulate drag event
    await wrapper.trigger('dragend')
    expect(wrapper.emitted('position-changed')).toBeTruthy()
  })
})
```

### Integration Tests

```typescript
// tests/api/canvas.test.ts
describe('/api/canvas', () => {
  it('should create canvas successfully', async () => {
    const response = await $fetch('/api/canvas', {
      method: 'POST',
      body: { title: 'Test Canvas', type: 'WRITING' }
    })
    expect(response.title).toBe('Test Canvas')
    expect(response.type).toBe('WRITING')
  })
  
  it('should return 401 for unauthenticated requests', async () => {
    await expect($fetch('/api/canvas')).rejects.toThrow('401')
  })
})
```

### E2E Tests

```typescript
// tests/e2e/canvas-collaboration.spec.ts
test('Canvas-centric collaboration flow', async ({ page }) => {
  // Create new canvas
  await page.goto('/canvas')
  await page.click('[data-testid="create-canvas-button"]')
  await page.fill('[data-testid="canvas-title"]', 'Personal Profile Page')
  await page.selectOption('[data-testid="canvas-type"]', 'WEB_PAGE')
  await page.click('[data-testid="create-button"]')
  
  // Should navigate to canvas workspace
  await expect(page).toHaveURL(/\/canvas\/[a-zA-Z0-9]+/)
  
  // Verify canvas-centric layout
  const canvas = page.locator('[data-testid="canvas-preview"]')
  const chat = page.locator('[data-testid="floating-chat"]')
  
  await expect(canvas).toBeVisible()
  await expect(chat).toBeVisible()
  
  // Test AI collaboration
  await page.fill('[data-testid="chat-input"]', 'Create a modern personal profile page with a hero section')
  await page.click('[data-testid="send-message"]')
  
  // Wait for AI response and code generation
  await expect(page.locator('[data-testid="ai-working"]')).toBeVisible()
  await expect(page.locator('[data-testid="ai-working"]')).toBeHidden({ timeout: 10000 })
  
  // Verify live preview updated
  const previewFrame = page.frameLocator('[data-testid="preview-iframe"]')
  await expect(previewFrame.locator('h1')).toBeVisible()
  
  // Test iterative changes
  await page.fill('[data-testid="chat-input"]', 'Make the background gradient and add some animations')
  await page.click('[data-testid="send-message"]')
  
  // Wait for changes to apply
  await page.waitForTimeout(2000)
  
  // Verify changes in preview
  const backgroundStyle = await previewFrame.locator('body').getAttribute('style')
  expect(backgroundStyle).toContain('gradient')
})

test('Chat interface modes', async ({ page }) => {
  await page.goto('/canvas/test-canvas-id')
  
  // Test floating chat
  const floatingChat = page.locator('[data-testid="floating-chat"]')
  await expect(floatingChat).toBeVisible()
  
  // Test dragging
  await floatingChat.dragTo(page.locator('body'), { targetPosition: { x: 100, y: 200 } })
  
  // Test mode switching
  await page.click('[data-testid="chat-mode-toggle"]')
  
  // Should switch to sidebar
  const sidebarChat = page.locator('[data-testid="sidebar-chat"]')
  await expect(sidebarChat).toBeVisible()
  await expect(floatingChat).toBeHidden()
  
  // Test hiding chat
  await page.click('[data-testid="chat-mode-toggle"]')
  await expect(sidebarChat).toBeHidden()
  
  // Should show chat toggle button
  await expect(page.locator('[data-testid="show-chat-button"]')).toBeVisible()
})

test('Canvas sharing', async ({ page }) => {
  await page.goto('/canvas/test-canvas-id')
  
  // Open share dialog
  await page.click('[data-testid="share-button"]')
  await expect(page.locator('[data-testid="share-dialog"]')).toBeVisible()
  
  // Create share link
  await page.click('[data-testid="create-share-link"]')
  
  // Copy share URL
  const shareUrl = await page.locator('[data-testid="share-url"]').textContent()
  expect(shareUrl).toContain('/canvas/share/')
  
  // Test shared canvas in new tab
  const newPage = await page.context().newPage()
  await newPage.goto(shareUrl)
  
  // Should show read-only canvas
  await expect(newPage.locator('[data-testid="shared-canvas"]')).toBeVisible()
  await expect(newPage.locator('[data-testid="floating-chat"]')).toBeHidden()
})
```

## Performance Considerations

### Optimization Strategies

1. **Virtual Scrolling**: For canvases with many content blocks, implement virtual scrolling to render only visible blocks.

2. **Debounced Auto-save**: Implement debounced saving to prevent excessive API calls during editing.

3. **Lazy Loading**: Load canvas content progressively, starting with metadata and loading blocks as needed.

4. **Caching Strategy**: Implement client-side caching for frequently accessed canvases.

5. **WebSocket Integration**: For real-time collaboration, use WebSockets instead of polling.

### Memory Management

```typescript
// Cleanup strategy for content blocks
export function useCanvasCleanup() {
  const cleanupObservers = ref<(() => void)[]>([])
  
  const addCleanup = (cleanup: () => void) => {
    cleanupObservers.value.push(cleanup)
  }
  
  const cleanup = () => {
    cleanupObservers.value.forEach(fn => fn())
    cleanupObservers.value = []
  }
  
  onUnmounted(cleanup)
  
  return { addCleanup, cleanup }
}
```

## Security Considerations

### Access Control

1. **Canvas Ownership**: Ensure users can only access their own canvases
2. **Content Validation**: Validate all content block data on the server
3. **XSS Prevention**: Sanitize HTML content in web demo blocks
4. **Rate Limiting**: Implement rate limiting for AI collaboration requests

### Data Protection

```typescript
// Server-side validation
export function validateCanvasData(data: any): ValidationResult {
  const schema = z.object({
    title: z.string().min(1).max(100),
    type: z.enum(['WRITING', 'DIAGRAM', 'WEB_DEMO', 'DRAWING']),
    contentBlocks: z.array(z.object({
      type: z.string(),
      content: z.any(),
      position: z.object({
        x: z.number().min(0),
        y: z.number().min(0)
      }),
      size: z.object({
        width: z.number().min(50),
        height: z.number().min(50)
      })
    })).optional()
  })
  
  return schema.safeParse(data)
}
```

This design provides a comprehensive foundation for transforming the existing boards feature into a robust Canvas platform while addressing the current technical issues and enhancing the user experience.
