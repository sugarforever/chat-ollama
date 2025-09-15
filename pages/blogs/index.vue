<template>
  <div class="blog-container">
    <!-- Hero Section -->
    <div class="bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div class="max-w-4xl mx-auto px-6 lg:px-8 py-24">
        <div class="text-center">
          <h1 class="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
            Blog
          </h1>
          <p class="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Technical insights, development stories, and thoughts on AI, web development, and building better software experiences.
          </p>
        </div>
      </div>
    </div>

    <!-- Content Section -->
    <div class="max-w-4xl mx-auto px-6 lg:px-8 py-16">
      <div v-if="posts.length === 0" class="text-center py-24">
        <div class="text-gray-300 dark:text-gray-600 mb-6">
          <UIcon name="i-heroicons-document-text-20-solid" class="w-20 h-20 mx-auto" />
        </div>
        <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">No blog posts found</h3>
        <p class="text-lg text-gray-600 dark:text-gray-400">Check back soon for new content!</p>
      </div>

      <div v-else class="space-y-12">
        <article v-for="post in posts" :key="post.slug" class="group">
          <NuxtLink :to="`/blogs/${post.slug}`" class="block">
            <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 hover:shadow-xl hover:-translate-y-1 hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-300">
              <div class="flex flex-col">
                <time class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">
                  {{ formatDate(post.date) }}
                </time>

                <h2 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors leading-tight">
                  {{ post.title }}
                </h2>

                <p class="text-lg text-gray-600 dark:text-gray-400 mb-6 line-clamp-3 leading-relaxed">
                  {{ post.description }}
                </p>

                <div class="flex items-center text-gray-900 dark:text-white text-base font-semibold group-hover:gap-3 transition-all duration-200">
                  Read article
                  <UIcon name="i-heroicons-arrow-right-20-solid" class="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
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
