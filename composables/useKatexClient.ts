import { onMounted } from 'vue'

export function useKatexClient() {
    onMounted(() => {
        // Only run in client-side
        if (typeof window === 'undefined') return

        // Find all server-side rendered LaTeX blocks
        const ssrBlocks = document.querySelectorAll('.katex-block-ssr')

        if (ssrBlocks.length === 0) return

        // Function to render blocks once KaTeX is loaded
        const renderBlocks = (katex: any) => {
            ssrBlocks.forEach((block) => {
                try {
                    const latex = decodeURIComponent(block.getAttribute('data-latex') || '')
                    if (!latex) return

                    // Create a new div to replace the SSR block
                    const newBlock = document.createElement('div')
                    newBlock.className = 'katex-block'

                    // Render the LaTeX
                    newBlock.innerHTML = katex.renderToString(latex, {
                        throwOnError: false,
                        errorColor: '#cc0000',
                        displayMode: true
                    })

                    // Replace the SSR block with the rendered block
                    block.parentNode?.replaceChild(newBlock, block)
                } catch (error: any) {
                    console.error('Error rendering LaTeX client-side:', error)
                    // Show error message
                    block.innerHTML = `<pre class="katex-error">Error rendering LaTeX: ${error.message}</pre>`
                    block.className = 'katex-error-block'
                }
            })
        }

        // Dynamically import KaTeX
        import('katex').then((katex) => {
            renderBlocks(katex.default || katex)
        }).catch((error: any) => {
            console.error('Failed to load KaTeX:', error)
            // Show error message on all blocks
            ssrBlocks.forEach((block) => {
                block.innerHTML = `<pre class="katex-error">Failed to load KaTeX: ${error.message}</pre>`
                block.className = 'katex-error-block'
            })
        })
    })
}
