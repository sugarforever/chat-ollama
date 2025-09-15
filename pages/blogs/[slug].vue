<template>
    <div class="blog-post-container">
        <div v-if="post">
            <!-- Breadcrumb Navigation -->
            <div class="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                <div class="max-w-4xl mx-auto px-6 lg:px-8 py-6">
                    <nav class="flex items-center space-x-3 text-sm">
                        <NuxtLink to="/blogs" class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">
                            Blog
                        </NuxtLink>
                        <UIcon name="i-heroicons-chevron-right-20-solid" class="w-4 h-4 text-gray-300 dark:text-gray-600" />
                        <span class="text-gray-900 dark:text-white font-semibold truncate">{{ post.title }}</span>
                    </nav>
                </div>
            </div>

            <!-- Article Content -->
            <article class="max-w-4xl mx-auto px-6 lg:px-8 py-12">
                <!-- Article Header -->
                <header class="mb-8 pb-8 border-b border-gray-100 dark:border-gray-800">
                    <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-6 leading-tight tracking-tight">
                        {{ post.title }}
                    </h1>

                    <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 text-gray-600 dark:text-gray-400">
                        <time class="flex items-center text-sm font-medium uppercase tracking-wider">
                            <UIcon name="i-heroicons-calendar-days-20-solid" class="w-4 h-4 mr-2" />
                            {{ formatDate(post.date) }}
                        </time>
                        <div class="flex items-center text-sm font-medium uppercase tracking-wider">
                            <UIcon name="i-heroicons-clock-20-solid" class="w-4 h-4 mr-2" />
                            {{ estimateReadingTime(post.content) }} min read
                        </div>
                    </div>
                </header>

                <!-- Article Body -->
                <div class="prose prose-lg dark:prose-invert max-w-none
                            prose-headings:font-bold prose-headings:tracking-tight
                            prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base
                            prose-p:leading-relaxed prose-p:text-gray-700 dark:prose-p:text-gray-300
                            prose-a:text-gray-900 dark:prose-a:text-white prose-a:no-underline hover:prose-a:underline"
                     v-html="processContent(post.content)" />

                <!-- Article Footer -->
                <footer class="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <NuxtLink
                                  to="/blogs"
                                  class="inline-flex items-center text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 font-semibold transition-all duration-200 group">
                            <UIcon name="i-heroicons-arrow-left-20-solid" class="w-5 h-5 mr-3 group-hover:-translate-x-1 transition-transform duration-200" />
                            Back to Blog
                        </NuxtLink>

                        <div class="flex items-center space-x-6">
                            <span class="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Share this post:</span>
                            <button
                                    @click="sharePost"
                                    class="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all duration-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                                    title="Share this post">
                                <UIcon name="i-heroicons-share-20-solid" class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </footer>
            </article>
        </div>

        <!-- Error State -->
        <div v-else class="max-w-4xl mx-auto px-6 lg:px-8 py-32 text-center">
            <div class="text-gray-300 dark:text-gray-600 mb-8">
                <UIcon name="i-heroicons-document-text-20-solid" class="w-24 h-24 mx-auto" />
            </div>
            <h1 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">Post Not Found</h1>
            <p class="text-lg text-gray-600 dark:text-gray-400 mb-12 max-w-lg mx-auto leading-relaxed">
                Sorry, the requested blog post does not exist or may have been moved.
            </p>
            <NuxtLink
                      to="/blogs"
                      class="inline-flex items-center bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 px-8 py-4 rounded-2xl font-semibold transition-all duration-200 group">
                <UIcon name="i-heroicons-arrow-left-20-solid" class="w-5 h-5 mr-3 group-hover:-translate-x-1 transition-transform duration-200" />
                Back to Blog
            </NuxtLink>
        </div>
    </div>
</template>

<script setup>

// Use blog layout
definePageMeta({
    layout: 'blog'
})

const route = useRoute()

// Use server-side data fetching with useFetch
const { data: post } = await useFetch(`/api/blogs/${route.params.slug}`, {
    server: true,
    default: () => null
})

// Set SEO meta if post exists
if (post.value) {
    useSeoMeta({
        title: post.value.title,
        description: post.value.description,
        ogTitle: post.value.title,
        ogDescription: post.value.description,
        ogType: 'article',
        articlePublishedTime: post.value.date,
        articleAuthor: 'ChatOllama Team'
    })
} else {
    useSeoMeta({
        title: 'Post Not Found',
        description: 'The requested blog post could not be found.'
    })
}

function processContent(content) {
    if (!content) return ''

    // Remove the first H1 tag that matches the post title to avoid duplication
    // This handles cases where the markdown file has its own title H1
    let processedContent = content

    // Remove the first H1 tag if it exists at the beginning of the content
    processedContent = processedContent.replace(/^<h1[^>]*>.*?<\/h1>\s*/, '')

    return processedContent
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

function estimateReadingTime(content) {
    // Remove HTML tags and count words
    const text = content.replace(/<[^>]*>/g, '')
    const words = text.split(/\s+/).length
    const wordsPerMinute = 200
    return Math.ceil(words / wordsPerMinute)
}

function sharePost() {
    if (navigator.share && post.value) {
        navigator.share({
            title: post.value.title,
            text: post.value.description,
            url: window.location.href
        }).catch(err => console.log('Error sharing:', err))
    } else if (post.value) {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(window.location.href).then(() => {
            // You could show a toast notification here
            console.log('URL copied to clipboard')
        }).catch(err => console.log('Error copying to clipboard:', err))
    }
}
</script>
