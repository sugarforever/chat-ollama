import { isAclEnabled } from '~/server/utils/auth'

export default defineEventHandler(() => {
  return {
    aclEnabled: isAclEnabled()
  }
})
