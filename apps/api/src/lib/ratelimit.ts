/**
 * Minimaler In-Memory-Rate-Limiter für öffentliche Endpunkte
 * (Buchungsanfragen/Verfügbarkeitschecks gegen Spam).
 *
 * Hinweis: In-Memory ist nur für eine Instanz gültig. Bei mehreren API-Replikas
 * muss ein gemeinsamer Store (z. B. Redis) verwendet werden.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

function sweep(now: number): void {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > 10_000) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Test-/Wartungshilfe: alle Zähler verwerfen. */
export function resetRateLimits(): void {
  buckets.clear();
}

// Gelegentliches Aufräumen, damit die Map nicht unbegrenzt wächst.
const timer = setInterval(() => sweep(Date.now()), 10 * 60_000);
timer.unref?.();