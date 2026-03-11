import Redis from "ioredis";

let redis: Redis | null = null;

// In-memory fallback store for local development without Redis
const memoryStore = new Map<string, { value: string; expiresAt?: number }>();

function isMemoryExpired(key: string): boolean {
  const entry = memoryStore.get(key);
  if (!entry) return true;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return true;
  }
  return false;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  exists(key: string): Promise<number>;
}

const memoryFallback: RedisLike = {
  async get(key: string) {
    if (isMemoryExpired(key)) return null;
    return memoryStore.get(key)?.value ?? null;
  },
  async set(key: string, value: string, ...args: (string | number)[]) {
    let expiresAt: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (String(args[i]).toUpperCase() === "EX" && args[i + 1]) {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        break;
      }
    }
    memoryStore.set(key, { value, expiresAt });
    return "OK";
  },
  async del(key: string) {
    return memoryStore.delete(key) ? 1 : 0;
  },
  async incr(key: string) {
    const entry = memoryStore.get(key);
    const current = entry && !isMemoryExpired(key) ? parseInt(entry.value, 10) : 0;
    const next = current + 1;
    memoryStore.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt,
    });
    return next;
  },
  async expire(key: string, seconds: number) {
    const entry = memoryStore.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  },
  async exists(key: string) {
    return isMemoryExpired(key) ? 0 : 1;
  },
};

let usingFallback = false;

export function getRedis(): RedisLike {
  if (usingFallback) return memoryFallback;

  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("REDIS_URL is required in production");
      }
      console.warn("[Redis] REDIS_URL not set. Using in-memory fallback.");
      usingFallback = true;
      return memoryFallback;
    }

    try {
      redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 3000,
      });

      redis.on("error", () => {
        if (!usingFallback) {
          if (process.env.NODE_ENV === "production") {
            console.error("[Redis] Connection failed in production.");
          } else {
            console.warn(
              "[Redis] Connection failed. Using in-memory fallback."
            );
            usingFallback = true;
          }
        }
      });

      redis.connect().catch(() => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[Redis] Could not connect. Using in-memory fallback.");
          usingFallback = true;
        }
      });
    } catch {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Failed to initialize Redis in production");
      }
      console.warn("[Redis] Init failed. Using in-memory fallback.");
      usingFallback = true;
      return memoryFallback;
    }
  }

  if (usingFallback) return memoryFallback;
  return redis as unknown as RedisLike;
}
