import { listUserSkills, ensureSkillsDirExists } from '~/server/utils/userSkills'

export default defineEventHandler(async (event) => {
  try {
    // Ensure skills directory exists
    ensureSkillsDirExists()

    // Re-scan skills directories
    const result = listUserSkills()

    console.log(`Skills reloaded: found ${result.skills.length} skills`)

    return {
      success: true,
      message: `Reloaded ${result.skills.length} skills`,
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
    console.error('Failed to reload skills:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to reload skills'
    })
  }
})
