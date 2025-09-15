import { getAllBlogPosts } from '~/utils/blog'

export default defineEventHandler(async (event) => {
  try {
    const posts = await getAllBlogPosts()
    
    return {
      success: true,
      data: posts,
      total: posts.length
    }
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch blog posts'
    })
  }
})