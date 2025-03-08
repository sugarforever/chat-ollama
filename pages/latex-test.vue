<template>
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">LaTeX Rendering Test</h1>

    <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">Inline LaTeX</h2>
        <div v-html="inlineLatexExample" class="md-body"></div>
      </div>

      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">Block LaTeX</h2>
        <div v-html="blockLatexExample" class="md-body"></div>
      </div>

      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">Complex LaTeX Example</h2>
        <div v-html="complexLatexExample" class="md-body"></div>
      </div>

      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">LaTeX Code Block</h2>
        <div v-html="latexCodeBlockExample" class="md-body"></div>
      </div>

      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-2">Error Handling Test</h2>
        <div v-html="errorHandlingExample" class="md-body"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useKatexClient } from '~/composables/useKatexClient'
import { computed } from 'vue'

const markdown = useMarkdown()

// Initialize client-side KaTeX rendering
useKatexClient()

// Computed properties for markdown content
const inlineLatexExample = computed(() => {
  return markdown.render('When $a \\ne 0$, there are two solutions to $ax^2 + bx + c = 0$ and they are $x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}$.')
})

const blockLatexExample = computed(() => {
  return markdown.render('$$\\frac{d}{dx}e^x = e^x$$')
})

const complexLatexExample = computed(() => {
  return markdown.render('$$\\begin{aligned} \\nabla \\times \\vec{\\mathbf{B}} -\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{E}}}{\\partial t} & = \\frac{4\\pi}{c}\\vec{\\mathbf{j}} \\\\ \\nabla \\cdot \\vec{\\mathbf{E}} & = 4 \\pi \\rho \\\\ \\nabla \\times \\vec{\\mathbf{E}}\\, +\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{B}}}{\\partial t} & = \\vec{\\mathbf{0}} \\\\ \\nabla \\cdot \\vec{\\mathbf{B}} & = 0 \\end{aligned}$$')
})

const latexCodeBlockExample = computed(() => {
  const content = [
    "Here's Newton's Second Law of Motion in LaTeX:",
    "",
    "```latex",
    "\\vec{F} = m\\vec{a}",
    "```",
    "",
    "This states that the net force (F) acting on an object equals the mass (m) of the object multiplied by its acceleration (a). The arrows above F and a indicate they are vector quantities.",
    "",
    "Alternatively, it can also be written as:",
    "",
    "```latex",
    "\\vec{F} = \\frac{d\\vec{p}}{dt} = \\frac{d(m\\vec{v})}{dt}",
    "```",
    "",
    "Where:",
    "- p is momentum",
    "- t is time",
    "- v is velocity",
    "",
    "This form shows that force equals the rate of change of momentum with respect to time."
  ].join('\n')

  return markdown.render(content)
})

const errorHandlingExample = computed(() => {
  // This LaTeX has an intentional error (missing closing brace)
  return markdown.render('Here is an example of LaTeX with an error: $\\frac{1}{2$')
})
</script>

<style scoped>
.katex-block {
  margin: 1em 0;
  text-align: center;
}

.katex-error {
  color: #cc0000;
  background-color: #ffeeee;
  padding: 0.5rem;
  border-radius: 0.25rem;
  white-space: pre-wrap;
}
</style>
