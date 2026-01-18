export interface SkillMetadata {
  name: string
  description: string
  path: string
  source: 'user' | 'project'
  enabled: boolean
}

export interface SkillInfo extends SkillMetadata {
  content: string
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
}

export interface SkillsConfig {
  userSkillsDir: string
  projectSkillsDir?: string
}

export interface SkillsListResult {
  skills: SkillMetadata[]
  userSkillsDir: string
  projectSkillsDir?: string
}
