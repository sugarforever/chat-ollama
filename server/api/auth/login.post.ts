import { createError, eventHandler, readBody } from 'h3'
import prisma from "@/server/utils/prisma"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { Role } from './signup.post'

const refreshTokens: Record<number, Record<string, any>> = {}
export const SECRET = process.env.SECRET || 'changeit'

const validate = async (name: string, password: string) => {
  if (!name || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and password cannot be empty'
    })
  }

  const exist = await prisma.user.findUnique({ where: { name: name } })
  if (!exist) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid user name and password`
    })
  }

  // Check if user signed up with OAuth (no password set)
  if (!exist.password && exist.provider) {
    throw createError({
      statusCode: 400,
      statusMessage: `Please log in using ${exist.provider} instead`
    })
  }

  if (!exist.password) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid user name and password`
    })
  }

  const match = bcrypt.compareSync(password, exist.password)
  if (!match) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid user name and password`
    })
  }

  return exist
}

export default eventHandler(async (event) => {
  const { name, username, password } = await readBody(event)

  // Support both 'name' and 'username' for backwards compatibility
  const userIdentifier = name || username
  const userRecord = await validate(userIdentifier, password)

  const expiresIn = 365 * 24 * 60 * 60
  const refreshToken = Math.floor(Math.random() * (1000000000000000 - 1 + 1)) + 1
  let role = 'user'
  if (userRecord.role === Role.ADMIN) {
    role = 'admin'
  } else if (userRecord.role === Role.SUPERADMIN) {
    role = 'superadmin'
  }

  const user = {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    role: role
  }

  const accessToken = jwt.sign({ ...user, scope: ['test', 'user'] }, SECRET, { expiresIn })
  refreshTokens[refreshToken] = {
    accessToken,
    user
  }

  // Set JWT token in cookie for browser-based authentication
  setCookie(event, 'auth-token', accessToken, {
    maxAge: expiresIn,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  })

  return {
    token: {
      accessToken,
      refreshToken
    }
  }
})
