import { google } from 'googleapis'
import { createError } from 'h3'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`
)

export default defineEventHandler(async (event) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth is not configured'
    })
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent'
  })

  return sendRedirect(event, authUrl)
})
