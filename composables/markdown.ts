import MarkdownIt from "markdown-it"
import MarkdownItAbbr from "markdown-it-abbr"
import MarkdownItAnchor from "markdown-it-anchor"
import MarkdownItDiagrams from "markdown-it-diagram"

import MarkdownItFootnote from "markdown-it-footnote"
import MarkdownItSub from "markdown-it-sub"
import MarkdownItSup from "markdown-it-sup"
import MarkdownItTasklists from "markdown-it-task-lists"
import MarkdownItTOC from "markdown-it-toc-done-right"
import MarkdownItKatex from "markdown-it-katex"
import hljs from "highlight.js"

// For client-side rendering of LaTeX code blocks
let katexModule: any = null
let mermaidModule: any = null

// Try to load KaTeX if we're in a browser environment
if (typeof window !== 'undefined') {
  // We'll load it asynchronously to avoid blocking
  import('katex').then(module => {
    katexModule = module.default || module
  }).catch(err => {
    console.error('Failed to load KaTeX:', err)
  })

  import('mermaid').then(async (module) => {
    mermaidModule = module.default || module
    mermaidModule.initialize({ startOnLoad: false }) // Changed to false to control rendering manually
      ; (window as any).mermaidModule = mermaidModule
  }).catch(err => {
    console.error('Failed to load Mermaid:', err)
  })
}

// Custom plugin to handle ```latex code blocks
function latexBlockPlugin(md: MarkdownIt) {
  // Store the original fence renderer
  const defaultFenceRenderer = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  // Override the fence renderer
  md.renderer.rules.fence = function (tokens, idx, options, _env, self) {
    const token = tokens[idx]
    const info = token.info.trim()

    // If it's a latex code block, render it with KaTeX
    if (info === 'latex') {
      // Use the same options as markdown-it-katex
      const katexOptions = {
        throwOnError: false,
        errorColor: '#cc0000',
        displayMode: true // Display mode for block equations
      }

      try {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined') {
          // If KaTeX is loaded, use it
          if (katexModule) {
            return '<div class="katex-block">' +
              katexModule.renderToString(token.content, katexOptions) +
              '</div>'
          } else {
            // If KaTeX isn't loaded yet, return a placeholder that will be rendered client-side
            return `<div class="katex-block-ssr" data-latex="${encodeURIComponent(token.content)}"></div>`
          }
        } else {
          // Server-side rendering - just wrap in a div with a class for now
          // The actual rendering will happen client-side
          return `<div class="katex-block-ssr" data-latex="${encodeURIComponent(token.content)}"></div>`
        }
      } catch (error: any) {
        console.error('Error rendering LaTeX:', error)
        return `<pre class="katex-error">Error rendering LaTeX: ${error.message}</pre>`
      }
    }

    // Otherwise, use the default renderer
    return defaultFenceRenderer(tokens, idx, options, _env, self)
  }
}

export function useMarkdown() {
  return new MarkdownIt({
    highlight(str, lang) {
      lang = hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
    },
  })
    .use(MarkdownItAbbr)
    .use(MarkdownItAnchor)
    .use(MarkdownItDiagrams)
    .use(MarkdownItFootnote)
    .use(MarkdownItSub)
    .use(MarkdownItSup)
    .use(MarkdownItTasklists)
    .use(MarkdownItTOC)
    .use(MarkdownItKatex, {
      throwOnError: false,
      errorColor: '#cc0000'
    })
    .use(latexBlockPlugin) // Add our custom plugin
}

// Composable to handle mermaid diagram rendering
export function useMermaidRenderer() {
  const renderMermaidDiagrams = async (container?: HTMLElement) => {
    if (typeof window === 'undefined' || !mermaidModule) return

    try {
      // Find all mermaid diagrams in the container or document
      const selector = '.mermaid'
      const elements = container
        ? container.querySelectorAll(selector)
        : document.querySelectorAll(selector)

      if (elements.length > 0) {
        // Filter out elements that contain incomplete mermaid syntax
        const validElements = Array.from(elements).filter(element => {
          // Skip if already rendered (has SVG content)
          if (element.querySelector('svg')) return false

          const content = element.textContent?.trim() || ''

          // Skip if content is empty or too short
          if (!content || content.length < 5) return false

          // Check for common incomplete patterns that indicate streaming is still in progress
          const hasIncompleteMarkers = content.includes('```') ||
            content.endsWith('...') ||
            content.includes('▌') || // cursor/streaming indicator
            content.match(/\s+$/) // ends with whitespace (might be mid-stream)

          if (hasIncompleteMarkers) return false

          // Check if it looks like a complete mermaid diagram
          // Must have a diagram type (graph, flowchart, sequenceDiagram, etc.)
          const mermaidKeywords = [
            'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
            'erDiagram', 'journey', 'gantt', 'pie', 'gitgraph', 'mindmap',
            'timeline', 'sankey', 'block', 'packet', 'architecture'
          ]

          const hasValidStart = mermaidKeywords.some(keyword =>
            content.toLowerCase().startsWith(keyword.toLowerCase())
          )

          // Skip if it doesn't start with a valid mermaid diagram type
          if (!hasValidStart) return false

          // Additional check: ensure it has some basic structure (arrows, connections, etc.)
          const hasBasicStructure = /-->|->|\||\[|\{|\(/.test(content)

          return hasBasicStructure
        })

        if (validElements.length > 0) {
          // Run mermaid on the valid elements only
          await mermaidModule.run({
            nodes: validElements
          })
        }
      }
    } catch (error) {
      console.error('Error rendering Mermaid diagrams:', error)
    }
  }

  return {
    renderMermaidDiagrams
  }
}
