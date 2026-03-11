import { getRedis } from "./redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  };
}

// Pre-configured rate limits
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`auth:${ip}`, 5, 60);
}

export async function checkVoteRateLimit(
  sessionId: string
): Promise<RateLimitResult> {
  return checkRateLimit(`vote:${sessionId}`, 3, 60);
}

export async function checkAdminRateLimit(
  ip: string
): Promise<RateLimitResult> {
  return checkRateLimit(`admin:${ip}`, 30, 60);
}
