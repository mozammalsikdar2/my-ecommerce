interface MemoryBucket {
  count: number;
  resetAt: number;
}

const burstStore = new Map<string, MemoryBucket>();
const maxBurstBuckets = 10_000;

export function checkMemoryBurstLimit(
  key: string,
  maxRequests = 4,
  windowMs = 60_000,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = burstStore.get(key);

  if (!current || now > current.resetAt) {
    burstStore.set(key, { count: 1, resetAt: now + windowMs });
    if (burstStore.size > maxBurstBuckets) {
      for (const [bucketKey, bucket] of burstStore) {
        if (now > bucket.resetAt) burstStore.delete(bucketKey);
      }
      while (burstStore.size > maxBurstBuckets) {
        const oldestKey = burstStore.keys().next().value;
        if (oldestKey === undefined) break;
        burstStore.delete(oldestKey);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000),
      ),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
