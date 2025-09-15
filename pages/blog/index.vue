<template>
  <div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="text-center mb-10">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          {{ $t('blog.title', 'ChatOllama Blog') }}
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          {{ $t('blog.description', 'Insights, tutorials, and updates about AI, LLMs, and ChatOllama development') }}
        </p>
      </div>

      <div class="flex flex-col gap-8">
        <div v-if="allTags.length > 0" class="flex flex-wrap gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 self-center mr-4">
            {{ $t('blog.filter.tags', 'Filter by tags:') }}
          </span>
          <button
            v-for="tag in allTags"
            :key="tag"
            @click="toggleTag(tag)"
            :class="[
              'inline-block px-3 py-1 rounded-full text-sm font-medium transition-colors',
              selectedTags.includes(tag)
                ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            ]"
          >
            {{ tag }}
          </button>
        </div>

        <main class="w-full">
          <div v-if="loading" class="text-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p class="mt-4 text-gray-600 dark:text-gray-400">
              {{ $t('blog.loading', 'Loading blog posts...') }}
            </p>
          </div>

          <div v-else-if="error" class="text-center py-12">
            <div class="text-red-600 dark:text-red-400 mb-4">
              <Icon name="heroicons:exclamation-triangle" class="w-12 h-12 mx-auto" />
            </div>
            <p class="text-gray-600 dark:text-gray-400">{{ error }}</p>
          </div>

          <div v-else-if="filteredPosts.length === 0" class="text-center py-12">
            <div class="text-gray-400 dark:text-gray-600 mb-4">
              <Icon name="heroicons:document-text" class="w-12 h-12 mx-auto" />
            </div>
            <p class="text-gray-600 dark:text-gray-400">
              {{ $t('blog.noPosts', 'No blog posts found') }}
            </p>
          </div>

          <div v-else class="grid gap-8">
            <article
              v-for="post in paginatedPosts"
              :key="post.slug"
              class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center space-x-4">
                    <time
                      :datetime="post.date"
                      class="text-sm text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDate(post.date) }}
                    </time>
                    <span
                      v-if="post.language === 'zh'"
                      class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    >
                      中文
                    </span>
                  </div>
                </div>

                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  <NuxtLink
                    :to="`/blog/${post.slug}`"
                    class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    {{ post.title }}
                  </NuxtLink>
                </h2>

                <p v-if="post.excerpt" class="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed text-sm">
                  {{ post.excerpt }}
                </p>

                <div v-if="post.tags && post.tags.length > 0" class="mb-4">
                  <span
                    v-for="tag in post.tags"
                    :key="tag"
                    class="inline-block bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-sm mr-2 mb-1"
                  >
                    {{ tag }}
                  </span>
                </div>

                <div class="flex justify-end">
                  <NuxtLink
                    :to="`/blog/${post.slug}`"
                    class="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 font-medium"
                  >
                    {{ $t('blog.readMore', 'Read more') }}
                    <Icon name="heroicons:arrow-right" class="ml-2 w-4 h-4" />
                  </NuxtLink>
                </div>
              </div>
            </article>
          </div>

          <div v-if="totalPages > 1" class="mt-12 flex justify-center">
            <nav class="flex items-center space-x-2">
              <button
                @click="currentPage = Math.max(1, currentPage - 1)"
                :disabled="currentPage === 1"
                :class="[
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  currentPage === 1
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                ]"
              >
                {{ $t('common.previous', 'Previous') }}
              </button>

              <span
                v-for="page in visiblePages"
                :key="page"
                @click="currentPage = page"
                :class="[
                  'px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors',
                  page === currentPage
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                ]"
              >
                {{ page }}
              </span>

              <button
                @click="currentPage = Math.min(totalPages, currentPage + 1)"
                :disabled="currentPage === totalPages"
                :class="[
                  'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  currentPage === totalPages
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                ]"
              >
                {{ $t('common.next', 'Next') }}
              </button>
            </nav>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '~/utils/blog'

definePageMeta({
  layout: 'blog'
})

const { $i18n } = useNuxtApp()
const { posts, loading, error, loadAllPosts, getAllTags } = useBlog()

const selectedTags = ref<string[]>([])
const currentPage = ref(1)
const postsPerPage = 10

await loadAllPosts()

const allTags = computed(() => getAllTags())

const filteredPosts = computed(() => {
  let filtered = posts.value

  if (selectedTags.value.length > 0) {
    filtered = filtered.filter(post =>
      selectedTags.value.every(tag => post.tags?.includes(tag))
    )
  }

  return filtered
})

const totalPages = computed(() => Math.ceil(filteredPosts.value.length / postsPerPage))

const paginatedPosts = computed(() => {
  const start = (currentPage.value - 1) * postsPerPage
  const end = start + postsPerPage
  return filteredPosts.value.slice(start, end)
})

const visiblePages = computed(() => {
  const pages = []
  const maxVisible = 5
  const start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
  const end = Math.min(totalPages.value, start + maxVisible - 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return pages
})

function toggleTag(tag: string) {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
  currentPage.value = 1
}

watch(selectedTags, () => {
  currentPage.value = 1
})

useSeoMeta({
  title: 'ChatOllama Blog',
  description: 'Insights, tutorials, and updates about AI, LLMs, and ChatOllama development',
  ogTitle: 'ChatOllama Blog',
  ogDescription: 'Insights, tutorials, and updates about AI, LLMs, and ChatOllama development',
  ogType: 'website',
  twitterCard: 'summary_large_image'
})
</script>