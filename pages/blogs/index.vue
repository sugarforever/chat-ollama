<template>
  <div class="blog-container">
    <!-- Hero Section -->
    <div class="relative bg-gradient-to-br from-white via-blue-50/30 to-purple-50/20 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/10 overflow-hidden">
      <!-- Subtle geometric background -->
      <div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
        <svg class="w-full h-full" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" stroke-width="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <circle cx="100" cy="50" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="300" cy="150" r="1.5" fill="currentColor" opacity="0.3" />
          <circle cx="80" cy="130" r="1" fill="currentColor" opacity="0.5" />
          <circle cx="320" cy="70" r="2.5" fill="currentColor" opacity="0.2" />
        </svg>
      </div>

      <!-- Floating elements -->
      <div class="absolute top-8 left-8 w-2 h-2 bg-blue-400/20 dark:bg-blue-300/10 rounded-full animate-pulse"></div>
      <div class="absolute top-16 right-12 w-1 h-1 bg-purple-400/30 dark:bg-purple-300/15 rounded-full animate-pulse delay-700"></div>
      <div class="absolute bottom-12 left-16 w-1.5 h-1.5 bg-indigo-400/25 dark:bg-indigo-300/12 rounded-full animate-pulse delay-1000"></div>

      <!-- Content -->
      <div class="relative max-w-4xl mx-auto px-6 lg:px-8 py-20">
        <div class="text-center">
          <!-- Minimalist icon/symbol -->
          <div class="inline-flex items-center justify-center w-16 h-16 mb-8 bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-400/15 dark:to-purple-400/15 rounded-2xl backdrop-blur-sm border border-white/20 dark:border-gray-800/30">
            <svg class="w-8 h-8 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>

          <!-- Typography with modern styling -->
          <p class="text-lg md:text-xl font-medium text-gray-700 dark:text-gray-200 max-w-2xl mx-auto leading-relaxed tracking-wide">
            Technical insights and development stories
          </p>

          <!-- Subtle underline accent -->
          <div class="flex justify-center mt-6">
            <div class="w-16 h-0.5 bg-gradient-to-r from-blue-500/40 via-purple-500/40 to-indigo-500/40 dark:from-blue-400/30 dark:via-purple-400/30 dark:to-indigo-400/30 rounded-full"></div>
          </div>
        </div>
      </div>

      <!-- Bottom edge fade -->
      <div class="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-950 to-transparent"></div>
    </div>

    <!-- Content Section -->
    <div class="max-w-4xl mx-auto px-6 lg:px-8 py-12">
      <div v-if="posts.length === 0" class="text-center py-12">
        <div class="text-gray-300 dark:text-gray-600 mb-3">
          <UIcon name="i-heroicons-document-text-20-solid" class="w-12 h-12 mx-auto" />
        </div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">No blog posts found</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">Check back soon for new content!</p>
      </div>

      <div v-else class="space-y-6">
        <article v-for="post in posts" :key="post.slug" class="group">
          <NuxtLink :to="`/blogs/${post.slug}`" class="block">
            <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 p-5 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200">
              <div class="flex flex-col">
                <time class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                  {{ formatDate(post.date) }}
                </time>

                <h2 class="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors leading-snug">
                  {{ post.title }}
                </h2>

                <p class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2 leading-relaxed">
                  {{ post.description }}
                </p>

                <div class="flex items-center text-gray-900 dark:text-white text-xs font-semibold group-hover:gap-1 transition-all duration-200">
                  Read article
                  <UIcon name="i-heroicons-arrow-right-20-solid" class="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform duration-200" />
                </div>
              </div>
            </div>
          </NuxtLink>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>

// Use blog layout
definePageMeta({
  layout: 'blog'
})

// Set SEO meta
useSeoMeta({
  title: 'Blog - Technical Insights & Development Stories',
  description: 'Technical insights, development stories, and thoughts on AI, web development, and building better software experiences.',
  ogTitle: 'Blog - Technical Insights & Development Stories',
  ogDescription: 'Technical insights, development stories, and thoughts on AI, web development, and building better software experiences.',
  ogType: 'website'
})

// Use server-side data fetching with useFetch
const { data: posts } = await useFetch('/api/blogs', {
  server: true,
  default: () => []
})

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>
