/**
 * 文章内存仓库。
 * 作用：详情页需要按 id 反查文章(含正文)，而 RSS/API 都只给列表。
 * 策略：TTL + 容量上限，进程重启即失效(前端 localStorage 收藏会兜底)。
 */
import config from '../config.js';

const store = new Map();

export function remember(article) {
  if (!article?.id) return article;
  store.delete(article.id); // 重新插入以维持 LRU 顺序
  store.set(article.id, article);
  if (store.size > config.cache.maxEntries * 4) {
    const overflow = store.size - config.cache.maxEntries * 4;
    let removed = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++removed >= overflow) break;
    }
  }
  return article;
}

export function rememberMany(articles = []) {
  for (const article of articles) remember(article);
  return articles;
}

export function getArticle(id) {
  return store.get(id) || null;
}

export function hasArticle(id) {
  return store.has(id);
}

export function storeSize() {
  return store.size;
}
