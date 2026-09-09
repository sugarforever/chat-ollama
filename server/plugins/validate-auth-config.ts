import { getJwtSecret } from '../utils/jwt'

export default defineNitroPlugin(() => {
  getJwtSecret()
})
