// Server-side only utilities for markdown parsing
let dependenciesCache = null

// Initialize dependencies lazily
async function getDependencies() {
  if (!process.server) {
    throw new Error('Dependencies can only be initialized on the server side')
  }

  if (dependenciesCache) {
    return dependenciesCache
  }

  const fs = await import('fs')
  const path = await import('path')
  const fm = (await import('front-matter')).default
  const MarkdownIt = (await import('markdown-it')).default

  const md = new MarkdownIt({
    html: true, // Allow HTML in Markdown
    linkify: true, // Convert URLs to links
    typographer: true, // Enable smart quotes, etc.
  })

  dependenciesCache = { fs, path, fm, md }
  return dependenciesCache
}

// Resolve blog directory for different deployment environments
async function resolveBlogDir(path) {
  const { fs } = await getDependencies()

  // For Vercel and other serverless environments, try different paths
  const possiblePaths = [
    path.join(process.cwd(), 'content/blogs'), // Development & most production builds
    path.join(process.cwd(), '.output/public/content/blogs'), // Nitro public assets
    path.join(process.cwd(), '.output/server/content/blogs'), // Nitro server assets
    path.join(process.cwd(), '.vercel/source/content/blogs'), // Vercel source
    path.join('/var/task/content/blogs'), // Lambda environment
    path.join('/tmp/content/blogs'), // Alternative serverless path
    path.resolve(__dirname, '../content/blogs'), // Relative to utils
    path.resolve(__dirname, '../../content/blogs'), // Alternative relative
    path.resolve(process.cwd(), 'content/blogs'), // Absolute resolution
  ]

  // Add environment-specific paths
  if (process.env.VERCEL) {
    possiblePaths.unshift(path.join(process.env.VERCEL_PROJECT_ROOT || process.cwd(), 'content/blogs'))
  }

  // Add Nitro runtime paths
  if (process.env.NITRO_PRESET === 'vercel') {
    possiblePaths.unshift(path.join(process.cwd(), 'server/content/blogs'))
  }

  for (const dir of possiblePaths) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        if (files.some(file => file.endsWith('.md'))) {
          console.log(`Using blog directory: ${dir}`)
          return dir
        }
      }
    } catch (error) {
      // Continue trying other paths
    }
  }

  // Fallback to default
  const defaultDir = path.join(process.cwd(), 'content/blogs')
  console.warn(`Blog directory not found, using fallback: ${defaultDir}`)
  return defaultDir
}

// Get all blog posts (server-side only)
export async function getPosts() {
  if (!process.server) {
    throw new Error('getPosts can only be called on the server side')
  }

  const { fs, path, fm, md } = await getDependencies()

  // Robust path resolution for different environments
  const blogDir = await resolveBlogDir(path)
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

  const { fs, path, fm, md } = await getDependencies()

  // Robust path resolution for different environments
  const blogDir = await resolveBlogDir(path)
  const filePath = path.join(blogDir, `${slug}.md`)
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
