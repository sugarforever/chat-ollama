import { getBlogPostBySlug } from '~/utils/blog'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Blog post slug is required'
    })
  }

  try {
    const post = await getBlogPostBySlug(slug)
    
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