import matter from 'gray-matter'

export interface BlogPost {
  slug: string
  title: string
  description?: string
  date: string
  author?: string
  tags?: string[]
  language: string
  readingTime?: number
  content: string
  excerpt?: string
  path: string
}

export interface BlogMetadata {
  title: string
  description?: string
  date: string
  author?: string
  tags?: string[]
  excerpt?: string
}

export function extractSlugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '')
}

export function extractDateFromSlug(slug: string): string {
  const dateMatch = slug.match(/^(\d{8})-/)
  if (dateMatch) {
    const dateStr = dateMatch[1]
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)
    return `${year}-${month}-${day}`
  }
  return new Date().toISOString().split('T')[0]
}

export function generateExcerpt(content: string, length: number = 200): string {
  const cleanContent = content
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()

  if (cleanContent.length <= length) {
    return cleanContent
  }

  const excerpt = cleanContent.substring(0, length)
  const lastSpaceIndex = excerpt.lastIndexOf(' ')
  return lastSpaceIndex > 0 ? excerpt.substring(0, lastSpaceIndex) + '...' : excerpt + '...'
}

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200
  const words = content.split(/\s+/).length
  return Math.ceil(words / wordsPerMinute)
}

export function isChineseContent(content: string): boolean {
  const chineseCharCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const totalCharCount = content.replace(/\s/g, '').length
  return totalCharCount > 0 && (chineseCharCount / totalCharCount) > 0.3
}

export async function loadBlogPost(filePath: string, language: string = 'en'): Promise<BlogPost | null> {
  try {
    // This function should only be called server-side
    if (process.client) {
      throw new Error('loadBlogPost can only be called on server-side')
    }
    
    const { readFile } = await import('fs/promises')
    const fileContent = await readFile(filePath, 'utf-8')
    const { data: frontmatter, content } = matter(fileContent)
    
    const filename = filePath.split('/').pop() || ''
    const slug = extractSlugFromFilename(filename)
    
    const detectedLanguage = isChineseContent(content) ? 'zh' : language
    
    const post: BlogPost = {
      slug,
      title: frontmatter.title || extractTitleFromContent(content) || slug,
      description: frontmatter.description,
      date: frontmatter.date || extractDateFromSlug(slug),
      author: frontmatter.author || 'ChatOllama Team',
      tags: frontmatter.tags || [],
      language: detectedLanguage,
      content,
      excerpt: frontmatter.excerpt || generateExcerpt(content),
      readingTime: calculateReadingTime(content),
      path: filePath
    }

    return post
  } catch (error) {
    console.error(`Error loading blog post from ${filePath}:`, error)
    return null
  }
}

function extractTitleFromContent(content: string): string | null {
  const titleMatch = content.match(/^#\s+(.+)$/m)
  return titleMatch ? titleMatch[1].trim() : null
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  // This function should only be called server-side
  if (process.client) {
    throw new Error('getAllBlogPosts can only be called on server-side')
  }

  const posts: BlogPost[] = []
  const { join } = await import('path')
  const { readdir, stat } = await import('fs/promises')
  const blogsDir = join(process.cwd(), 'blogs')
  
  try {
    const items = await readdir(blogsDir)
    
    // Only load markdown files directly in /blogs directory, skip subfolders
    for (const item of items) {
      const itemPath = join(blogsDir, item)
      const itemStat = await stat(itemPath)
      
      if (itemStat.isFile() && item.endsWith('.md')) {
        const post = await loadBlogPost(itemPath, 'en')
        if (post) {
          posts.push(post)
        }
      }
      // Skip directories (like /zh subfolder)
    }
    
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch (error) {
    console.error('Error loading blog posts:', error)
    return []
  }
}

export async function getBlogPostBySlug(slug: string, language?: string): Promise<BlogPost | null> {
  const posts = await getAllBlogPosts()
  return posts.find(post => post.slug === slug && (!language || post.language === language)) || null
}

export function generateBlogUrl(slug: string): string {
  return `/blog/${slug}`
}

export function formatDate(dateString: string, locale: string = 'en-US'): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}