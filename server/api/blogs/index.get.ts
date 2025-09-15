// API endpoint to get all blog posts
export default defineEventHandler(async (event) => {
    try {
        // Import server-side utilities
        const { getPosts } = await import('~/utils/parseMarkdown')
        const posts = await getPosts()
        return posts
    } catch (error) {
        console.error('Error fetching blog posts:', error)
        return []
    }
})
