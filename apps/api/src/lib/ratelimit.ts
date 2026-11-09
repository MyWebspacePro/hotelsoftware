/**
 * Minimaler In-Memory-Rate-Limiter für öffentliche Endpunkte
 * (Buchungsanfragen/Verfügbarkeitschecks gegen Spam).
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
