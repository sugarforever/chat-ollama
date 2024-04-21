import MarkdownIt from "markdown-it"
import MarkdownItAbbr from "markdown-it-abbr"
import MarkdownItAnchor from "markdown-it-anchor"
import MarkdownItFootnote from "markdown-it-footnote"
import MarkdownItSub from "markdown-it-sub"
import MarkdownItSup from "markdown-it-sup"
import MarkdownItTasklists from "markdown-it-task-lists"
import MarkdownItTOC from "markdown-it-toc-done-right"
import hljs from "highlight.js"

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
}
