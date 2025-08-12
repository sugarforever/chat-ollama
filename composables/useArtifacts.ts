import type { Artifact, ArtifactVersion } from '~/components/ArtifactPanel.vue'

export interface ArtifactDetectionResult {
  hasArtifact: boolean
  artifact: Artifact | null
}

/**
 * Composable for detecting and extracting artifacts from message content
 */
export function useArtifacts() {
  // Store for artifact versions by session
  const artifactVersions = ref<Map<string, ArtifactVersion[]>>(new Map())
  
  /**
   * Detects if a message contains an artifact and extracts it
   */
  function detectArtifact(content: string | any[], messageId?: string | number): ArtifactDetectionResult {
    // Handle array content (multimodal messages)
    if (Array.isArray(content)) {
      const textContent = content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .filter(Boolean)
        .join('\n')
      
      if (!textContent) {
        return { hasArtifact: false, artifact: null }
      }
      
      return detectArtifact(textContent)
    }

    // Handle string content
    if (typeof content !== 'string') {
      return { hasArtifact: false, artifact: null }
    }

    // Try different artifact patterns
    const patterns = [
      // HTML artifacts
      {
        pattern: /```html\n([\s\S]*?)```/,
        type: 'html' as const,
        title: 'HTML Document'
      },
      // Vue component artifacts
      {
        pattern: /```vue\n([\s\S]*?)```/,
        type: 'vue' as const,
        title: 'Vue Component'
      },
      // JavaScript artifacts
      {
        pattern: /```(?:javascript|js)\n([\s\S]*?)```/,
        type: 'javascript' as const,
        title: 'JavaScript App'
      },
      // CSS artifacts
      {
        pattern: /```css\n([\s\S]*?)```/,
        type: 'css' as const,
        title: 'CSS Styles'
      },
      // SVG artifacts
      {
        pattern: /```svg\n([\s\S]*?)```/,
        type: 'svg' as const,
        title: 'SVG Graphics'
      },
      // Mermaid diagrams
      {
        pattern: /```mermaid\n([\s\S]*?)```/,
        type: 'mermaid' as const,
        title: 'Mermaid Diagram'
      }
    ]

    // Also check for standalone HTML, SVG, or Mermaid content
    const standalonePatterns = [
      // Standalone HTML (must have html, head, or body tags)
      {
        pattern: /<(?:html|head|body|!DOCTYPE)/i,
        extract: (content: string) => content,
        type: 'html' as const,
        title: 'HTML Document'
      },
      // Standalone SVG
      {
        pattern: /<svg[\s\S]*<\/svg>/i,
        extract: (content: string) => {
          const match = content.match(/<svg[\s\S]*<\/svg>/i)
          return match ? match[0] : ''
        },
        type: 'svg' as const,
        title: 'SVG Graphics'
      }
    ]

    // Check code block patterns first
    for (const { pattern, type, title } of patterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        const extractedContent = match[1].trim()
        
        // Additional validation based on type
        if (isValidArtifactContent(extractedContent, type)) {
          return {
            hasArtifact: true,
            artifact: {
              id: generateArtifactId(),
              type,
              title: extractArtifactTitle(extractedContent) || title,
              content: extractedContent,
              language: type,
              version: 1,
              messageId,
              timestamp: Date.now()
            }
          }
        }
      }
    }

    // Check standalone patterns
    for (const { pattern, extract, type, title } of standalonePatterns) {
      if (pattern.test(content)) {
        const extractedContent = extract(content).trim()
        
        if (isValidArtifactContent(extractedContent, type)) {
          return {
            hasArtifact: true,
            artifact: {
              id: generateArtifactId(),
              type,
              title: extractArtifactTitle(extractedContent) || title,
              content: extractedContent,
              language: type,
              version: 1,
              messageId,
              timestamp: Date.now()
            }
          }
        }
      }
    }

    return { hasArtifact: false, artifact: null }
  }

  /**
   * Validates if content is suitable for artifact rendering
   */
  function isValidArtifactContent(content: string, type: Artifact['type']): boolean {
    if (!content || content.length < 10) return false

    switch (type) {
      case 'html':
        return content.includes('<') && content.includes('>')
      case 'vue':
        return content.includes('<template') || content.includes('<script') || content.includes('<style')
      case 'javascript':
        return content.length > 20 // Basic JS should have some substance
      case 'css':
        return content.includes('{') && content.includes('}')
      case 'svg':
        return content.includes('<svg') && content.includes('</svg>')
      case 'mermaid':
        return /^(graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|flowchart)/m.test(content)
      default:
        return true
    }
  }

  /**
   * Extracts a meaningful title from artifact content
   */
  function extractArtifactTitle(content: string): string | null {
    // Try to find title in HTML
    const htmlTitleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i)
    if (htmlTitleMatch) {
      return htmlTitleMatch[1].trim()
    }

    // Try to find title in Vue component name
    const vueNameMatch = content.match(/name:\s*['"`]([^'"`]+)['"`]/)
    if (vueNameMatch) {
      return vueNameMatch[1]
    }

    // Try to find title in comments
    const commentMatch = content.match(/(?:\/\*|<!--|\*|\/\/)\s*([^\n\r*\/]*(?:app|component|widget|tool|demo)[^\n\r*\/]*)/i)
    if (commentMatch) {
      return commentMatch[1].trim()
    }

    // Try to find h1 tag
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i)
    if (h1Match) {
      return h1Match[1].replace(/<[^>]*>/g, '').trim()
    }

    return null
  }

  /**
   * Generates a unique artifact ID
   */
  function generateArtifactId(): string {
    return `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Downloads an artifact as a file
   */
  function downloadArtifact(artifact: Artifact) {
    const extension = getFileExtension(artifact.type)
    const filename = `${artifact.title.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`
    
    const blob = new Blob([artifact.content], { type: getMimeType(artifact.type) })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    URL.revokeObjectURL(url)
  }

  /**
   * Gets the appropriate file extension for an artifact type
   */
  function getFileExtension(type: Artifact['type']): string {
    switch (type) {
      case 'html': return 'html'
      case 'vue': return 'vue'
      case 'javascript': return 'js'
      case 'css': return 'css'
      case 'svg': return 'svg'
      case 'mermaid': return 'mmd'
      default: return 'txt'
    }
  }

  /**
   * Gets the MIME type for an artifact
   */
  function getMimeType(type: Artifact['type']): string {
    switch (type) {
      case 'html': return 'text/html'
      case 'vue': return 'text/plain'
      case 'javascript': return 'application/javascript'
      case 'css': return 'text/css'
      case 'svg': return 'image/svg+xml'
      case 'mermaid': return 'text/plain'
      default: return 'text/plain'
    }
  }

  /**
   * Creates a shareable link for an artifact (placeholder implementation)
   */
  function shareArtifact(artifact: Artifact): string {
    // In a real implementation, this would upload to a service and return a URL
    // For now, just copy to clipboard
    const shareableContent = `# ${artifact.title}\n\n\`\`\`${artifact.type}\n${artifact.content}\n\`\`\``
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareableContent)
      return 'Copied to clipboard!'
    }
    
    return 'Sharing not supported'
  }

  /**
   * Adds an artifact version to the session store
   */
  function addArtifactVersion(sessionId: string, artifact: Artifact) {
    const versions = artifactVersions.value.get(sessionId) || []
    const artifactVersion: ArtifactVersion = {
      artifact: {
        ...artifact,
        version: getNextVersionNumber(sessionId, artifact.type)
      },
      messageId: artifact.messageId || '',
      timestamp: artifact.timestamp
    }
    
    versions.push(artifactVersion)
    artifactVersions.value.set(sessionId, versions)
    
    return artifactVersion
  }

  /**
   * Gets all versions of artifacts for a session
   */
  function getArtifactVersions(sessionId: string, artifactType?: string): ArtifactVersion[] {
    const versions = artifactVersions.value.get(sessionId) || []
    if (artifactType) {
      return versions.filter(v => v.artifact.type === artifactType)
    }
    return versions
  }

  /**
   * Gets the next version number for an artifact type in a session
   */
  function getNextVersionNumber(sessionId: string, artifactType: string): number {
    const versions = getArtifactVersions(sessionId, artifactType)
    return versions.length + 1
  }

  /**
   * Clears all versions for a session
   */
  function clearSessionVersions(sessionId: string) {
    artifactVersions.value.delete(sessionId)
  }

  /**
   * Gets the latest version of an artifact type in a session
   */
  function getLatestArtifactVersion(sessionId: string, artifactType: string): ArtifactVersion | null {
    const versions = getArtifactVersions(sessionId, artifactType)
    return versions.length > 0 ? versions[versions.length - 1] : null
  }

  return {
    detectArtifact,
    downloadArtifact,
    shareArtifact,
    isValidArtifactContent,
    extractArtifactTitle,
    addArtifactVersion,
    getArtifactVersions,
    clearSessionVersions,
    getLatestArtifactVersion,
    artifactVersions: readonly(artifactVersions)
  }
}