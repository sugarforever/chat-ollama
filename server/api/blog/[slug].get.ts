export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Blog post slug is required'
    })
  }

  try {
    // Try to read from static JSON file first (production)
    let posts = []
    try {
      const { readFile } = await import('fs/promises')
      const { join } = await import('path')
      const filePath = join(process.cwd(), 'public', 'blog-data.json')
      const fileContent = await readFile(filePath, 'utf-8')
      const blogData = JSON.parse(fileContent)
      posts = blogData.posts || []
    } catch (fsError) {
      // Fallback for development - load from filesystem
      console.warn('Static blog data not found, loading from filesystem:', fsError.message)
      const { getBlogPostsData } = await import('./_posts.json')
      posts = await getBlogPostsData()
    }
    
    const post = posts.find((p: any) => p.slug === slug)
    
    if (!post) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Blog post not found'
      })
    }

    return {
      success: true,
      data: post
    }
  } catch (error) {
    console.error(`Error fetching blog post ${slug}:`, error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch blog post'
    })
  }
})