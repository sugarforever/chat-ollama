import { listUserSkills, getUserSkillsDir, ensureSkillsDirExists } from '~/server/utils/userSkills'

export default defineEventHandler(async (event) => {
  try {
    // Ensure skills directory exists
    ensureSkillsDirExists()

    // List all available skills
    const result = listUserSkills()

    return {
      success: true,
      data: {
        skills: result.skills,
        directories: {
          user: result.userSkillsDir,
          project: result.projectSkillsDir
        },
        count: result.skills.length
      }
    }
  } catch (error: any) {
    console.error('Failed to list skills:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list skills'
    })
  }
})
