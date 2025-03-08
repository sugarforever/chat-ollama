import MarkdownIt from "markdown-it"
import MarkdownItAbbr from "markdown-it-abbr"
import MarkdownItAnchor from "markdown-it-anchor"
import MarkdownItFootnote from "markdown-it-footnote"
import MarkdownItSub from "markdown-it-sub"
import MarkdownItSup from "markdown-it-sup"
import MarkdownItTasklists from "markdown-it-task-lists"
import MarkdownItTOC from "markdown-it-toc-done-right"
import MarkdownItKatex from "markdown-it-katex"
import hljs from "highlight.js"

// For client-side rendering of LaTeX code blocks
let katexModule: any = null

// Try to load KaTeX if we're in a browser environment
if (typeof window !== 'undefined') {
  // We'll load it asynchronously to avoid blocking
  import('katex').then(module => {
    katexModule = module.default || module
  }).catch(err => {
    console.error('Failed to load KaTeX:', err)
  })
}

// Custom plugin to handle ```latex code blocks
function latexBlockPlugin(md: MarkdownIt) {
  // Store the original fence renderer
  const defaultFenceRenderer = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  // Override the fence renderer
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
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
    return defaultFenceRenderer(tokens, idx, options, env, self)
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
