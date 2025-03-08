declare module 'katex' {
    export interface KatexOptions {
        displayMode?: boolean
        output?: string
        leqno?: boolean
        fleqn?: boolean
        throwOnError?: boolean
        errorColor?: string
        macros?: any
        minRuleThickness?: number
        colorIsTextColor?: boolean
        maxSize?: number
        maxExpand?: number
        strict?: boolean | string
        trust?: boolean | ((context: { command: string; url: string; protocol: string }) => boolean)
        globalGroup?: boolean
    }

    export function renderToString(
        tex: string,
        options?: KatexOptions
    ): string

    export function renderToElement(
        element: HTMLElement,
        tex: string,
        options?: KatexOptions
    ): void

    export const version: string
}
