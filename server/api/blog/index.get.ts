export default defineEventHandler(async (event) => {
  try {
    // Try to read from static JSON file first (production)
    let blogData
    try {
      const { readFile } = await import('fs/promises')
      const { join } = await import('path')
      const filePath = join(process.cwd(), 'public', 'blog-data.json')
      const fileContent = await readFile(filePath, 'utf-8')
      blogData = JSON.parse(fileContent)
    } catch (fsError) {
      // Fallback for development - load from filesystem
      console.warn('Static blog data not found, loading from filesystem:', fsError.message)
      const { getBlogPostsData } = await import('./_posts.json')
      const posts = await getBlogPostsData()
      blogData = { posts, total: posts.length }
    }
    
    return {
      success: true,
      data: blogData.posts || [],
      total: blogData.total || 0
    }
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    
    // Return empty result instead of error for production
    return {
      success: true,
      data: [],
      total: 0
    }
  }
})