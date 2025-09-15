// API endpoint to get all blog posts
export default defineEventHandler(async (event) => {
    try {
        // Import server-side utilities
        const { getPosts } = await import('~/utils/parseMarkdown')
        const posts = await getPosts()

        // Set cache headers for Vercel
        setHeader(event, 'Cache-Control', 's-maxage=300, stale-while-revalidate')

        return posts
    } catch (error) {
        console.error('Error fetching blog posts:', error)

        // Return structured error for better debugging
        if (process.env.NODE_ENV === 'development') {
            throw createError({
                statusCode: 500,
                statusMessage: `Blog posts fetch error: ${error.message}`
            })
        }

        return []
    }
})
