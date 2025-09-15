import type { BlogPost } from '~/utils/blog'

interface BlogState {
  posts: BlogPost[]
  loading: boolean
  error: string | null
}

export const useBlog = () => {
  const state = reactive<BlogState>({
    posts: [],
    loading: false,
    error: null
  })

  const loadAllPosts = async () => {
    state.loading = true
    state.error = null
    
    try {
      const response = await $fetch<{ success: boolean, data: BlogPost[], total: number }>('/api/blog')
      state.posts = response.data
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to load blog posts'
      console.error('Error loading blog posts:', error)
    } finally {
      state.loading = false
    }
  }

  const getPostBySlug = async (slug: string): Promise<BlogPost | null> => {
    try {
      const response = await $fetch<{ success: boolean, data: BlogPost }>(`/api/blog/${slug}`)
      return response.data
    } catch (error) {
      console.error(`Error loading blog post ${slug}:`, error)
      return null
    }
  }

  const getPostsByLanguage = (language: string): BlogPost[] => {
    return state.posts.filter(post => post.language === language)
  }

  const getPostsByTag = (tag: string): BlogPost[] => {
    return state.posts.filter(post => post.tags?.includes(tag))
  }

  const getAllTags = (): string[] => {
    const tags = new Set<string>()
    state.posts.forEach(post => {
      post.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }

  const getRelatedPosts = (currentPost: BlogPost, limit: number = 3): BlogPost[] => {
    const relatedPosts = state.posts
      .filter(post => post.slug !== currentPost.slug)
      .filter(post => post.language === currentPost.language)
      .filter(post => {
        const commonTags = post.tags?.filter(tag => currentPost.tags?.includes(tag)) || []
        return commonTags.length > 0
      })
      .slice(0, limit)

    if (relatedPosts.length < limit) {
      const additionalPosts = state.posts
        .filter(post => post.slug !== currentPost.slug)
        .filter(post => post.language === currentPost.language)
        .filter(post => !relatedPosts.includes(post))
        .slice(0, limit - relatedPosts.length)
      
      relatedPosts.push(...additionalPosts)
    }

    return relatedPosts
  }

  return {
    ...toRefs(state),
    loadAllPosts,
    getPostBySlug,
    getPostsByLanguage,
    getPostsByTag,
    getAllTags,
    getRelatedPosts
  }
}

export const useBlogSEO = (post: BlogPost) => {
  const { $i18n } = useNuxtApp()
  const route = useRoute()
  
  const generateSEOMeta = () => {
    const title = `${post.title} | ChatOllama Blog`
    const description = post.description || post.excerpt || `Read ${post.title} on ChatOllama Blog`
    const url = `${useRuntimeConfig().public.baseUrl || 'https://chatollama.com'}${route.path}`
    const imageUrl = `${useRuntimeConfig().public.baseUrl || 'https://chatollama.com'}/og-blog.png`

    return {
      title,
      meta: [
        { name: 'description', content: description },
        { name: 'keywords', content: post.tags?.join(', ') || '' },
        { name: 'author', content: post.author || 'ChatOllama Team' },
        { name: 'robots', content: 'index, follow' },
        
        // Open Graph
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: post.title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: imageUrl },
        { property: 'og:site_name', content: 'ChatOllama Blog' },
        { property: 'article:published_time', content: new Date(post.date).toISOString() },
        { property: 'article:author', content: post.author || 'ChatOllama Team' },
        { property: 'article:tag', content: post.tags?.join(', ') || '' },
        
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: post.title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: imageUrl },
        
        // Language
        { 'http-equiv': 'content-language', content: post.language }
      ],
      link: [
        { rel: 'canonical', href: url },
        { rel: 'alternate', hreflang: 'en', href: url.replace('/zh/', '/') },
        { rel: 'alternate', hreflang: 'zh', href: url.includes('/zh/') ? url : url.replace('/blog/', '/zh/blog/') }
      ]
    }
  }

  const generateStructuredData = () => {
    const baseUrl = useRuntimeConfig().public.baseUrl || 'https://chatollama.com'
    
    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description || post.excerpt,
      image: `${baseUrl}/og-blog.png`,
      author: {
        '@type': 'Organization',
        name: post.author || 'ChatOllama Team',
        url: baseUrl
      },
      publisher: {
        '@type': 'Organization',
        name: 'ChatOllama',
        url: baseUrl,
        logo: {
          '@type': 'ImageObject',
          url: `${baseUrl}/logo.png`
        }
      },
      datePublished: new Date(post.date).toISOString(),
      dateModified: new Date(post.date).toISOString(),
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${baseUrl}${route.path}`
      },
      articleSection: 'Technology',
      keywords: post.tags?.join(', ') || '',
      wordCount: post.content.split(/\s+/).length,
      timeRequired: `PT${post.readingTime || 1}M`,
      inLanguage: post.language === 'zh' ? 'zh-CN' : 'en-US'
    }
  }

  return {
    generateSEOMeta,
    generateStructuredData
  }
}