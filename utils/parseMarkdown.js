// Server-side only utilities for markdown parsing
let fs, path, fm, MarkdownIt, md

// Initialize dependencies only on server side
if (process.server) {
  fs = await import('fs')
  path = await import('path')
  fm = (await import('front-matter')).default
  MarkdownIt = (await import('markdown-it')).default
  
  md = new MarkdownIt({
    html: true, // Allow HTML in Markdown
    linkify: true, // Convert URLs to links
    typographer: true, // Enable smart quotes, etc.
  })
}

// Get all blog posts (server-side only)
export async function getPosts() {
  if (!process.server) {
    throw new Error('getPosts can only be called on the server side')
  }
  
  const blogDir = path.join(process.cwd(), 'content/blogs')
  let files
  try {
    files = fs.readdirSync(blogDir)
  } catch (error) {
    console.error('Error reading blog directory:', error)
    return []
  }
  
  const posts = files
    .filter(file => file.endsWith('.md'))
    .map(file => {
      try {
        const filePath = path.join(blogDir, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const { attributes, body } = fm(content)
        return {
          ...attributes,
          slug: file.replace('.md', ''),
          content: md.render(body),
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error)
        return null
      }
    })
    .filter(Boolean) // Remove null entries
    
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date))
}

// Get a single post by slug (server-side only)
export async function getPost(slug) {
  if (!process.server) {
    throw new Error('getPost can only be called on the server side')
  }
  
  const filePath = path.join(process.cwd(), 'content/blogs', `${slug}.md`)
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { attributes, body } = fm(content)
    return {
      ...attributes,
      slug,
      content: md.render(body),
    }
  } catch (error) {
    console.error(`Error reading post ${slug}:`, error)
    return null
  }
}