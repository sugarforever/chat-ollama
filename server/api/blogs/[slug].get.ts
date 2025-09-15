// API endpoint to get a single blog post by slug
export default defineEventHandler(async (event) => {
    try {
        const slug = getRouterParam(event, 'slug')

        if (!slug) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Slug parameter is required'
            })
        }

        // Import server-side utilities
        const { getPost } = await import('~/utils/parseMarkdown')
        const post = await getPost(slug)

        if (!post) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Blog post not found'
            })
        }

        // Set cache headers for Vercel
        setHeader(event, 'Cache-Control', 's-maxage=600, stale-while-revalidate')

        return post
    } catch (error) {
        console.error(`Error fetching blog post ${getRouterParam(event, 'slug')}:`, error)

        if (error.statusCode) {
            throw error
        }

        throw createError({
            statusCode: 500,
            statusMessage: 'Internal server error'
        })
    }
})
