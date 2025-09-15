import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getAllBlogPosts } from '../utils/blog'

async function generatePaginatedBlogData() {
  try {
    console.log('🔄 Generating paginated blog data...')
    
    const posts = await getAllBlogPosts()
    const postsPerPage = 20
    
    // Create index with excerpts only
    const postsIndex = posts.map(post => ({
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      tags: post.tags,
      language: post.language,
      excerpt: post.excerpt,
      readingTime: post.readingTime
    }))
    
    const outputDir = join(process.cwd(), 'public', 'blog')
    await mkdir(outputDir, { recursive: true })
    
    // Generate index file (for listing page)
    await writeFile(
      join(outputDir, 'index.json'),
      JSON.stringify({
        posts: postsIndex,
        total: posts.length,
        generated: new Date().toISOString()
      }, null, 2)
    )
    
    // Generate individual post files (for detail pages)
    for (const post of posts) {
      await writeFile(
        join(outputDir, `${post.slug}.json`),
        JSON.stringify(post, null, 2)
      )
    }
    
    // Generate paginated index files
    const totalPages = Math.ceil(posts.length / postsPerPage)
    for (let page = 1; page <= totalPages; page++) {
      const startIndex = (page - 1) * postsPerPage
      const pageData = {
        posts: postsIndex.slice(startIndex, startIndex + postsPerPage),
        page,
        totalPages,
        total: posts.length,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
      
      await writeFile(
        join(outputDir, `page-${page}.json`),
        JSON.stringify(pageData, null, 2)
      )
    }
    
    console.log(`✅ Generated ${posts.length} posts across ${totalPages} pages`)
    
  } catch (error) {
    console.error('❌ Failed to generate paginated blog data:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generatePaginatedBlogData()
}

export { generatePaginatedBlogData }