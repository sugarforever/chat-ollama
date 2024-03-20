import { Redis, RedisOptions } from "ioredis";

export const createRedisClient = () => {
  const options: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined
  };
  console.log("Redis client options: ", options);
  return new Redis(options);
}
