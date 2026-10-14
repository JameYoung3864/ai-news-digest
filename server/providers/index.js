/** Provider 注册表：按名字取适配器，未知名字回退到 rss。 */
import logger from '../lib/logger.js';
import config, { availableProviders, effectiveProvider } from '../config.js';
import * as gnews from './gnews.js';
import * as hackernews from './hackernews.js';
import * as newsapi from './newsapi.js';
import * as rss from './rss.js';

const registry = { rss, gnews, newsapi, hackernews };

export function getProvider(name) {
  const provider = registry[name];
  if (!provider) {
    logger.warn('unknown provider, fallback to rss', { requested: name });
    return registry.rss;
  }
  return provider;
}

/** 解析本次请求实际使用的 provider(带降级) */
export function resolveProvider(requested) {
  if (requested && requested !== 'auto') {
    if (requested === 'rss') return 'rss';
    if (availableProviders().includes(requested)) return requested;
    logger.warn('provider unavailable (missing key), fallback to rss', { requested });
    return 'rss';
  }
  return effectiveProvider() || config.newsProvider;
}

export { rss, gnews, newsapi, hackernews, registry };
export default registry;
