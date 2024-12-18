import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const apiKey = event.context.keys.openai.key || ''
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy'
      })
    })

    const data = await response.json()
    return data

  } catch (error) {
    console.error('Error creating audio session:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create audio session'
    })
  }
})
