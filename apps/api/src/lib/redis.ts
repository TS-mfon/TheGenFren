import IORedis from "ioredis";
import { Queue } from "bullmq";

import { config } from "../config.js";

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const paymentQueue = new Queue("payment-verification", {
  connection: redis
});

export const briefingQueue = new Queue("goal-briefing", {
  connection: redis
});

export async function acquireLeadershipLock(key: string, ownerId: string, ttlSeconds = 30) {
  const result = await redis.set(key, ownerId, "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function renewLeadershipLock(key: string, ownerId: string, ttlSeconds = 30) {
  const currentOwner = await redis.get(key);
  if (currentOwner !== ownerId) return false;
  await redis.expire(key, ttlSeconds);
  return true;
}

export async function releaseLeadershipLock(key: string, ownerId: string) {
  const currentOwner = await redis.get(key);
  if (currentOwner === ownerId) {
    await redis.del(key);
  }
}
