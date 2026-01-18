import os from 'os'
import path from 'path'
import fs from 'fs'
import { FilesystemBackend, createSkillsMiddleware } from 'deepagents'
import type { SkillMetadata, SkillInfo, SkillsListResult } from '../types/skills'

const CHATOLLAMA_DIR = '.chatollama'
const SKILLS_SUBDIR = 'skills'

// Convert Windows paths to POSIX format for deepagents
function toPosixPath(p: string): string {
  return p.split(path.sep).join('/')
}

/**
 * Get the path to the user's ChatOllama skills directory
 * Default: ~/.chatollama/skills/
 */
export function getUserSkillsDir(): string {
  return path.join(os.homedir(), CHATOLLAMA_DIR, SKILLS_SUBDIR)
}

/**
 * Get the path to the project-level skills directory
 * Default: ./.chatollama/skills/
 */
export function getProjectSkillsDir(): string {
  return path.join(process.cwd(), CHATOLLAMA_DIR, SKILLS_SUBDIR)
}

/**
 * Ensure the user skills directory exists, creating it if necessary
 */
export function ensureSkillsDirExists(): void {
  const dir = getUserSkillsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`Created skills directory: ${dir}`)
  }
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return null
  }

  const frontmatter = frontmatterMatch[1]
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

  if (!nameMatch) {
    return null
  }

  return {
    name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : ''
  }
}

/**
 * Scan a directory for skills (directories containing SKILL.md)
 */
function scanSkillsDir(dir: string, source: 'user' | 'project'): SkillMetadata[] {
  const skills: SkillMetadata[] = []

  if (!fs.existsSync(dir)) {
    return skills
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = path.join(dir, entry.name)
      const skillMdPath = path.join(skillPath, 'SKILL.md')

      if (fs.existsSync(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const metadata = parseSkillFrontmatter(content)

          if (metadata) {
            skills.push({
              name: metadata.name,
              description: metadata.description,
              path: skillPath,
              source,
              enabled: true
            })
          } else {
            // Fallback: use directory name as skill name
            skills.push({
              name: entry.name,
              description: '',
              path: skillPath,
              source,
              enabled: true
            })
          }
        } catch (err) {
          console.warn(`Failed to parse SKILL.md in ${skillPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`Failed to scan skills directory ${dir}:`, err)
  }

  return skills
}

/**
 * List all available skills from user and project directories
 */
export function listUserSkills(): SkillsListResult {
  const userSkillsDir = getUserSkillsDir()
  const projectSkillsDir = getProjectSkillsDir()

  const userSkills = scanSkillsDir(userSkillsDir, 'user')
  const projectSkills = scanSkillsDir(projectSkillsDir, 'project')

  // Combine skills, with project skills taking precedence for duplicates
  const skillsMap = new Map<string, SkillMetadata>()

  for (const skill of userSkills) {
    skillsMap.set(skill.name, skill)
  }

  for (const skill of projectSkills) {
    skillsMap.set(skill.name, skill)
  }

  return {
    skills: Array.from(skillsMap.values()),
    userSkillsDir,
    projectSkillsDir: fs.existsSync(projectSkillsDir) ? projectSkillsDir : undefined
  }
}

/**
 * Get detailed information about a specific skill
 */
export function getSkillInfo(skillName: string): SkillInfo | null {
  const { skills } = listUserSkills()
  const skill = skills.find(s => s.name === skillName)

  if (!skill) {
    return null
  }

  const skillMdPath = path.join(skill.path, 'SKILL.md')

  if (!fs.existsSync(skillMdPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8')

    return {
      ...skill,
      content,
      hasScripts: fs.existsSync(path.join(skill.path, 'scripts')),
      hasReferences: fs.existsSync(path.join(skill.path, 'references')),
      hasAssets: fs.existsSync(path.join(skill.path, 'assets'))
    }
  } catch (err) {
    console.error(`Failed to read skill ${skillName}:`, err)
    return null
  }
}

/**
 * Build skills system prompt section from available skills
 */
export function buildSkillsPrompt(): string {
  const { skills } = listUserSkills()

  if (skills.length === 0) {
    return ''
  }

  let prompt = '\n\n## Available Skills\n\n'
  prompt += 'You have access to the following skills. Each skill provides specialized capabilities:\n\n'

  for (const skill of skills) {
    prompt += `### ${skill.name}\n`
    if (skill.description) {
      prompt += `${skill.description}\n`
    }
    prompt += `Location: ${skill.path}\n\n`
  }

  prompt += 'To use a skill, read its SKILL.md file for detailed instructions.\n'

  return prompt
}

/**
 * Get all skill contents for injection into agent context
 */
export function getSkillsContext(): string {
  const { skills } = listUserSkills()

  if (skills.length === 0) {
    return ''
  }

  let context = ''

  for (const skill of skills) {
    const skillMdPath = path.join(skill.path, 'SKILL.md')

    if (fs.existsSync(skillMdPath)) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8')
        context += `\n\n--- SKILL: ${skill.name} ---\n${content}\n--- END SKILL: ${skill.name} ---\n`
      } catch (err) {
        console.warn(`Failed to read skill ${skill.name}:`, err)
      }
    }
  }

  return context
}

/**
 * Create skills middleware for deepagents
 * Uses FilesystemBackend with user and project skills directories as sources
 */
export function createUserSkillsMiddleware() {
  const userSkillsDir = getUserSkillsDir()
  const projectSkillsDir = getProjectSkillsDir()

  // Build sources list - user skills first, project skills override
  const sources: string[] = []

  if (fs.existsSync(userSkillsDir)) {
    sources.push(toPosixPath(userSkillsDir) + '/')
  }

  if (fs.existsSync(projectSkillsDir)) {
    sources.push(toPosixPath(projectSkillsDir) + '/')
  }

  if (sources.length === 0) {
    console.log('No skills directories found, skills middleware disabled')
    return null
  }

  // Create FilesystemBackend with root at filesystem root
  const backend = new FilesystemBackend({ rootDir: '/' })

  console.log('Creating skills middleware with sources:', sources)

  return createSkillsMiddleware({
    backend,
    sources
  })
}

/**
 * Get skills middleware configuration info (for debugging/display)
 */
export function getSkillsMiddlewareConfig() {
  const userSkillsDir = getUserSkillsDir()
  const projectSkillsDir = getProjectSkillsDir()

  return {
    userSkillsDir,
    projectSkillsDir: fs.existsSync(projectSkillsDir) ? projectSkillsDir : undefined,
    hasUserSkills: fs.existsSync(userSkillsDir),
    hasProjectSkills: fs.existsSync(projectSkillsDir)
  }
}
