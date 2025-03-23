import MarkdownIt from 'markdown-it'

declare module 'markdown-it-katex' {
    interface KatexOptions {
        throwOnError?: boolean
        errorColor?: string
        macros?: Record<string, string>
        colorIsTextColor?: boolean
        maxSize?: number
        maxExpand?: number
        displayMode?: boolean
        output?: 'html' | 'mathml' | 'htmlAndMathml'
        leqno?: boolean
        fleqn?: boolean
        trust?: boolean | ((context: { command: string, url: string, protocol: string }) => boolean)
        strict?: boolean | 'ignore' | 'warn' | 'error'
    }

    const plugin: MarkdownIt.PluginWithOptions<KatexOptions>
    export default plugin
}
