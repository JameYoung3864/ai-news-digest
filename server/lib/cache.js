/**
 * 进程内 TTL 缓存（含 single-flight 合并 + 上游失败时返回过期数据）。
 * 目的：保护上游免费配额、降低 AI token 消耗、提高弱网可用性。
 */
const store = new Map();
const inflight = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) return { ...entry, stale: true };
  return { ...entry, stale: false };
}

export function cacheSet(key, value, ttlMs, maxEntries = 500) {
  if (store.size >= maxEntries) {
    // 简单 LRU：删掉最早写入的一批
    const overflow = store.size - maxEntries + 1;
    let removed = 0;
    for (const oldestKey of store.keys()) {
      store.delete(oldestKey);
      if (++removed >= overflow) break;
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs, createdAt: Date.now() });
  return value;
}

export function cacheDelete(key) {
  store.delete(key);
}

export function cacheClear(prefix = '') {
  let count = 0;
  for (const key of [...store.keys()]) {
    if (!prefix || key.startsWith(prefix)) {
      store.delete(key);
      count += 1;
    }
  }
  return count;
}

export function cacheStats() {
  const now = Date.now();
  let fresh = 0;
  let stale = 0;
  for (const entry of store.values()) (now > entry.expiresAt ? stale++ : fresh++);
  return { entries: store.size, fresh, stale, inflight: inflight.size, keys: [...store.keys()] };
}

/**
 * 缓存读取 + 未命中则执行 factory。
 * @param {string} key
 * @param {() => Promise<any>} factory
 * @param {{ttlMs:number, maxEntries?:number, allowStaleOnError?:boolean}} options
 */
export async function cacheWrap(key, factory, options) {
  const { ttlMs, maxEntries = 500, allowStaleOnError = true } = options;

  const cached = cacheGet(key);
  if (cached && !cached.stale) return cached.value;

  // single-flight：并发同 key 只打一次上游
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await factory();
      cacheSet(key, value, ttlMs, maxEntries);
      return value;
    } catch (error) {
      if (allowStaleOnError && cached?.value !== undefined) {
        // 上游挂了，但旧数据还能用 —— 标记后降级返回
        return { ...cached.value, _stale: true, _staleReason: error.message };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
