import prisma from "@/server/utils/prisma"
import bcrypt from "bcrypt"

export enum Role {
  USER = 0,
  ADMIN = 1,
  SUPERADMIN = 2
}

const signUp = async (name: string, email: string, password: string) => {
  if (!name || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and password cannot be empty'
    })
  }

  const exist = await prisma.user.count({ where: { name: name } }) > 0
  if (exist) {
    throw createError({
      statusCode: 409,
      statusMessage: `User ${name} already exist`
    })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  return await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: process.env.SUPER_ADMIN_NAME === name ? Role.SUPERADMIN : Role.USER
    }
  })
}

export default defineEventHandler(async (event) => {
  const { name, email, password } = await readBody(event)
  try {
    const result = await signUp(name, email, password)
    return {
      status: "success",
      user: {
        id: result?.id
      }
    }
  } catch (error) {
    throw error
  }
})
