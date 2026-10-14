/**
 * 进程内滑动窗口限流(按 IP + 桶)。
 * 目的：保护上游免费配额，尤其是会花钱的 AI 接口。
 */
import { rateLimited } from '../lib/errors.js';
import logger from '../lib/logger.js';

const buckets = new Map();

function hit(key, windowMs, max) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }
  entry.count += 1;
  if (entry.count > max) return { allowed: false, remaining: 0, resetAt: entry.resetAt, count: entry.count };
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

// 定期清理过期桶，避免 Map 无限增长
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (now > entry.resetAt) buckets.delete(key);
}, 60_000);
sweeper.unref?.();

/**
 * @param {{windowMs:number, max:number, bucket:string}} options
 */
export function rateLimit({ windowMs, max, bucket = 'default' }) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = hit(`${bucket}:${ip}`, windowMs, max);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      logger.warn('rate limited', { bucket, ip, count: result.count });
      return next(rateLimited(`请求过于频繁(限制 ${max} 次 / ${Math.round(windowMs / 1000)} 秒)，请稍后再试`));
    }
    return next();
  };
}

export default rateLimit;
