import { getSkillInfo } from '~/server/utils/userSkills'

export default defineEventHandler(async (event) => {
  try {
    const name = getRouterParam(event, 'name')

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Skill name is required'
      })
    }

    const skillInfo = getSkillInfo(name)

    if (!skillInfo) {
      throw createError({
        statusCode: 404,
        statusMessage: `Skill '${name}' not found`
      })
    }

    return {
      success: true,
      data: skillInfo
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Failed to get skill info:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to get skill info'
    })
  }
})
