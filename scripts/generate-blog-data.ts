import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getAllBlogPosts } from '../utils/blog'

async function generateBlogData() {
  try {
    console.log('🔄 Generating blog data...')
    
    // Load all blog posts
    const posts = await getAllBlogPosts()
    console.log(`📝 Found ${posts.length} blog posts`)
    
    // Create output directory
    const outputDir = join(process.cwd(), 'public')
    await mkdir(outputDir, { recursive: true })
    
    // Write blog data as JSON
    const blogData = {
      posts,
      total: posts.length,
      generated: new Date().toISOString()
    }
    
    const outputPath = join(outputDir, 'blog-data.json')
    await writeFile(outputPath, JSON.stringify(blogData, null, 2))
    
    console.log(`✅ Blog data generated: ${outputPath}`)
    console.log(`📊 Generated data for ${posts.length} posts`)
    
    // List post titles for verification
    posts.forEach(post => {
      console.log(`   - ${post.title} (${post.language})`)
    })
    
  } catch (error) {
    console.error('❌ Failed to generate blog data:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateBlogData()
}

export { generateBlogData }