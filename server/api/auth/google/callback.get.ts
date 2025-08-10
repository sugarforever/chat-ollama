import { google } from 'googleapis'
import { createError } from 'h3'
import prisma from '@/server/utils/prisma'
import jwt from 'jsonwebtoken'
import { SECRET } from '../login.post'
import { Role } from '../signup.post'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`
)

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, error, state } = query

  if (error) {
    console.error('Google OAuth error:', error)
    throw createError({
      statusCode: 400,
      statusMessage: `Google OAuth error: ${error}`
    })
  }

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing authorization code'
    })
  }

  try {
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code as string)
    oauth2Client.setCredentials(tokens)

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: googleUser } = await oauth2.userinfo.get()

    if (!googleUser.email) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Unable to get user email from Google'
      })
    }

    // Check if user already exists
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: googleUser.email, provider: 'google' },
          { email: googleUser.email, provider: null }
        ]
      }
    })

    if (user) {
      // Update existing user with Google info if they signed up with email/password
      if (!user.provider) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            provider: 'google',
            provider_id: googleUser.id,
            avatar: googleUser.picture
          }
        })
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          name: googleUser.name || googleUser.email.split('@')[0],
          email: googleUser.email,
          provider: 'google',
          provider_id: googleUser.id,
          avatar: googleUser.picture,
          email_verified: googleUser.verified_email || false,
          role: Role.USER
        }
      })
    }

    // Create or update OAuth account record
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleUser.id!
        }
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
        id_token: tokens.id_token
      },
      create: {
        userId: user.id,
        type: 'oauth',
        provider: 'google',
        providerAccountId: googleUser.id!,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
        id_token: tokens.id_token
      }
    })

    // Generate JWT token for our app
    const expiresIn = 365 * 24 * 60 * 60
    let role = 'user'
    if (user.role === Role.ADMIN) {
      role = 'admin'
    } else if (user.role === Role.SUPERADMIN) {
      role = 'superadmin'
    }

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: role
    }

    const accessToken = jwt.sign({ ...userPayload, scope: ['test', 'user'] }, SECRET, { expiresIn })

    // Set JWT token in cookie and redirect to main app
    setCookie(event, 'auth-token', accessToken, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    })

    // Redirect to main app with a refresh parameter to trigger auth refresh
    return sendRedirect(event, '/?auth=success')
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to authenticate with Google'
    })
  }
})
