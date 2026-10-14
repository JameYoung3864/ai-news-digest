/**
 * GNews API 适配器(https://gnews.io)。
 * 需要 GNEWS_API_KEY —— 提供真正的关键词全网搜索与分页。
 */
import config from '../config.js';
import { notConfigured } from '../lib/errors.js';
import { fetchJson } from '../lib/httpClient.js';
import { safeUrl } from '../lib/textUtils.js';
import { dedupe, normalizeArticle, sortByDateDesc } from './normalize.js';

export const name = 'gnews';

const ENDPOINT = 'https://gnews.io/api/v4';

const GNEWS_TOPICS = {
  all: 'general',
  llm: 'technology',
  product: 'technology',
  agent: 'technology',
  research: 'science',
  business: 'business',
  hardware: 'technology',
  opensource: 'technology',
  policy: 'world',
  safety: 'technology',
  other: 'general',
};

function ensureKey() {
  if (!config.gnewsApiKey) {
    throw notConfigured('未配置 GNEWS_API_KEY，请在 .env 中填写或改用 NEWS_PROVIDER=rss');
  }
}

function mapArticle(item) {
  return {
    title: item.title,
    url: item.url,
    description: item.description || item.content || '',
    content: item.content || item.description || '',
    image: safeUrl(item.image || ''),
    author: '',
    publishedAt: item.publishedAt,
    sourceName: item.source?.name || 'GNews',
  };
}

/**
 * @param {{category?:string, q?:string, page?:number, pageSize?:number, lang?:string, sourceIds?:string[]}} params
 */
export async function fetchLatest(params = {}) {
  ensureKey();
  const { category = 'all', q = '', page = 1, pageSize = 10, lang } = params;

  // 有搜索词走 search 接口，否则走 top-headlines
  const useSearch = Boolean(q.trim());
  const url = new URL(useSearch ? `${ENDPOINT}/search` : `${ENDPOINT}/top-headlines`);

  if (useSearch) url.searchParams.set('q', q.trim());
  else url.searchParams.set('topic', GNEWS_TOPICS[category] || 'general');

  if (!useSearch && (category === 'research' || category === 'business')) {
    // GNews 的 topic 粒度较粗，用关键词再收一遍
    const hints = { research: 'AI research', business: 'AI funding' };
    url.searchParams.set('q', hints[category]);
  }

  url.searchParams.set('lang', lang === 'zh' ? 'zh' : lang === 'en' ? 'en' : 'en');
  url.searchParams.set('page', String(Math.max(1, page)));
  url.searchParams.set('max', String(Math.min(100, Math.max(1, pageSize))));
  url.searchParams.set('apikey', config.gnewsApiKey);

  const json = await fetchJson(url.toString(), {
    label: 'gnews',
    timeoutMs: config.request.timeoutMs,
    retry: config.request.retry,
  });

  const articles = sortByDateDesc(
    dedupe(
      (json.articles || [])
        .map((item) => normalizeArticle(mapArticle(item), { provider: 'gnews', trustAI: !useSearch }))
        .filter(Boolean),
    ),
  );

  return {
    articles,
    total: json.totalArticles ?? articles.length,
    upstreamPaged: true,
    failed: [],
    sourcesUsed: 1,
  };
}

/** GNews 自身支持分页，这里直接透传用户请求的页 */
export async function search(q, { page = 1, pageSize = 10, lang } = {}) {
  return fetchLatest({ q, page, pageSize, lang });
}

export default { name, fetchLatest, search };
