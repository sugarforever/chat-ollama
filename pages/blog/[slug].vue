<template>
  <div>
    <div v-if="pending" class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">
          {{ $t('blog.loading', 'Loading blog post...') }}
        </p>
      </div>
    </div>

    <div v-else-if="error" class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="text-center py-12">
        <div class="text-red-600 dark:text-red-400 mb-4">
          <Icon name="heroicons:exclamation-triangle" class="w-12 h-12 mx-auto" />
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {{ $t('blog.postNotFound', 'Blog post not found') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error.message }}</p>
        <NuxtLink
                  to="/blog"
                  class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
          <Icon name="heroicons:arrow-left" class="mr-2 w-4 h-4" />
          {{ $t('blog.backToBlog', 'Back to Blog') }}
        </NuxtLink>
      </div>
    </div>

    <article v-else-if="post" class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-8">
        <NuxtLink
                  to="/blog"
                  class="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 mb-6">
          <Icon name="heroicons:arrow-left" class="mr-2 w-4 h-4" />
          {{ $t('blog.backToBlog', 'Back to Blog') }}
        </NuxtLink>

        <header class="mb-8">
          <div class="flex items-center space-x-4 mb-4">
            <time
                  :datetime="post.date"
                  class="text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(post.date) }}
            </time>
            <span
                  v-if="post.language === 'zh'"
                  class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              中文
            </span>
          </div>

          <!--h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {{ post.title }}
          </h1-->

          <p v-if="post.description" class="text-lg text-gray-600 dark:text-gray-300 mb-6">
            {{ post.description }}
          </p>

          <div v-if="post.tags && post.tags.length > 0" class="mb-6">
            <span
                  v-for="tag in post.tags"
                  :key="tag"
                  class="inline-block bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-sm mr-2 mb-2">
              {{ tag }}
            </span>
          </div>

        </header>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div class="prose prose-lg dark:prose-invert max-w-none p-8">
          <div v-html="renderedContent" />
        </div>
      </div>

      <footer class="mt-12">
        <div v-if="relatedPosts.length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-8">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-6">
            {{ $t('blog.relatedPosts', 'Related Posts') }}
          </h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <article
                     v-for="relatedPost in relatedPosts"
                     :key="relatedPost.slug"
                     class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
              <div class="p-6">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">
                  <NuxtLink
                            :to="`/blog/${relatedPost.slug}`"
                            class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                    {{ relatedPost.title }}
                  </NuxtLink>
                </h3>
                <p v-if="relatedPost.excerpt" class="text-gray-600 dark:text-gray-300 text-xs mb-3">
                  {{ relatedPost.excerpt.substring(0, 120) }}{{ relatedPost.excerpt.length > 120 ? '...' : '' }}
                </p>
                <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                  <time :datetime="relatedPost.date">
                    {{ formatDate(relatedPost.date) }}
                  </time>
                  <span v-if="relatedPost.readingTime">
                    {{ relatedPost.readingTime }} min
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div class="flex justify-between items-center">
            <NuxtLink
                      to="/blog"
                      class="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium">
              <Icon name="heroicons:arrow-left" class="mr-2 w-4 h-4" />
              {{ $t('blog.allPosts', 'All Posts') }}
            </NuxtLink>

            <div class="flex space-x-4">
              <button
                      @click="sharePost"
                      class="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                <Icon name="heroicons:share" class="w-5 h-5" />
                <span class="ml-2 hidden sm:inline">{{ $t('blog.share', 'Share') }}</span>
              </button>
            </div>
          </div>
        </div>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
// Dynamically import markdown dependencies

definePageMeta({
  layout: 'blog'
})

import { formatDate } from '~/utils/blog'

const route = useRoute()
const router = useRouter()
const { $i18n } = useNuxtApp()

const slug = computed(() => route.params.slug as string)

const { data: post, pending, error } = await useLazyFetch(`/api/blog/${slug.value}`, {
  transform: (data: any) => data.data,
  key: `blog-post-${slug.value}`
})

const { getRelatedPosts } = useBlog()
const relatedPosts = computed(() => {
  return post.value ? getRelatedPosts(post.value, 3) : []
})

const renderedContent = ref('')

// Initialize markdown renderer
const initMarkdown = async () => {
  if (!post.value?.content) return

  const [
    { default: MarkdownIt },
    { default: markdownItAnchor },
    { default: markdownItToc },
    { default: markdownItKatex },
    { default: markdownItHighlight },
    { default: markdownItSub },
    { default: markdownItSup },
    { default: markdownItFootnote },
    { default: markdownItAbbr },
    { default: markdownItTaskLists }
  ] = await Promise.all([
    import('markdown-it'),
    import('markdown-it-anchor'),
    import('markdown-it-toc-done-right'),
    import('markdown-it-katex'),
    import('markdown-it-highlightjs'),
    import('markdown-it-sub'),
    import('markdown-it-sup'),
    import('markdown-it-footnote'),
    import('markdown-it-abbr'),
    import('markdown-it-task-lists')
  ])

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
  })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        symbol: '#',
        renderAttrs: () => ({ 'aria-hidden': 'true' })
      })
    })
    .use(markdownItToc, {
      includeLevel: [1, 2, 3],
      containerClass: 'table-of-contents'
    })
    .use(markdownItKatex)
    .use(markdownItHighlight)
    .use(markdownItSub)
    .use(markdownItSup)
    .use(markdownItFootnote)
    .use(markdownItAbbr)
    .use(markdownItTaskLists)

  renderedContent.value = md.render(post.value.content)
}

function sharePost() {
  if (navigator.share && post.value) {
    navigator.share({
      title: post.value.title,
      text: post.value.description || post.value.excerpt,
      url: window.location.href
    })
  } else if (post.value) {
    const shareText = `${post.value.title} - ${window.location.href}`
    navigator.clipboard.writeText(shareText)
  }
}

watch(post, async (newPost) => {
  if (newPost) {
    const { generateSEOMeta, generateStructuredData } = useBlogSEO(newPost)
    const seoMeta = generateSEOMeta()
    const structuredData = generateStructuredData()

    useSeoMeta(seoMeta)

    useHead({
      script: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(structuredData)
        }
      ]
    })

    // Initialize markdown rendering
    await initMarkdown()
  }
}, { immediate: true })

if (error.value?.statusCode === 404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Blog post not found'
  })
}
</script>

<style>
.prose {
  @apply text-gray-900 dark:text-gray-100;
}

.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  @apply text-gray-900 dark:text-white font-bold;
}

.prose h1 {
  @apply text-3xl mb-6 mt-8;
}

.prose h2 {
  @apply text-2xl mb-4 mt-8;
}

.prose h3 {
  @apply text-xl mb-3 mt-6;
}

.prose p {
  @apply mb-4 leading-relaxed;
}

.prose a {
  @apply text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 no-underline;
}

.prose a:hover {
  @apply underline;
}

.prose ul,
.prose ol {
  @apply mb-4 pl-6;
}

.prose li {
  @apply mb-2;
}

.prose blockquote {
  @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 mb-4;
}

.prose code {
  @apply bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono;
}

.prose pre {
  @apply bg-gray-900 dark:bg-gray-950 p-4 rounded-lg overflow-x-auto mb-4;
}

.prose pre code {
  @apply bg-transparent px-0 py-0 text-gray-100;
}

.prose table {
  @apply w-full border-collapse mb-4;
}

.prose th,
.prose td {
  @apply border border-gray-300 dark:border-gray-600 px-4 py-2 text-left;
}

.prose th {
  @apply bg-gray-100 dark:bg-gray-800 font-semibold;
}

.prose img {
  @apply max-w-full h-auto rounded-lg mx-auto my-6;
}

.table-of-contents {
  @apply bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6;
}

.table-of-contents ul {
  @apply list-none pl-0;
}

.table-of-contents li {
  @apply mb-1;
}

.table-of-contents a {
  @apply text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400;
}

.task-list-item {
  @apply list-none;
}

.task-list-item input {
  @apply mr-2;
}
</style>
