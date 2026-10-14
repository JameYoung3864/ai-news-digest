/**
 * NewsAPI.org 适配器。
 * 注意：免费开发者版只允许来自 localhost 的请求，且国内网络可能不可达，
 * 因此它始终不是默认 provider，失败时会自动回退到 RSS。
 */
import config from '../config.js';
import { notConfigured } from '../lib/errors.js';
import { fetchJson } from '../lib/httpClient.js';
import { safeUrl } from '../lib/textUtils.js';
import { dedupe, normalizeArticle, sortByDateDesc } from './normalize.js';

export const name = 'newsapi';

const ENDPOINT = 'https://newsapi.org/v2';

function ensureKey() {
  if (!config.newsapiApiKey) {
    throw notConfigured('未配置 NEWSAPI_API_KEY，请在 .env 中填写或改用 NEWS_PROVIDER=rss');
  }
}

function mapArticle(item) {
  return {
    title: item.title,
    url: item.url,
    description: item.description || '',
    content: item.content || item.description || '',
    image: safeUrl(item.urlToImage || ''),
    author: item.author || '',
    publishedAt: item.publishedAt,
    sourceName: item.source?.name || 'NewsAPI',
  };
}

function normalizeResponse(json) {
  return sortByDateDesc(
    dedupe((json.articles || []).map((item) => normalizeArticle(mapArticle(item), { provider: 'newsapi', trustAI: false })).filter(Boolean)),
  );
}

export async function fetchLatest(params = {}) {
  ensureKey();
  const { q = '', page = 1, pageSize = 10, lang } = params;
  const url = new URL(`${ENDPOINT}/${q.trim() ? 'everything' : 'top-headlines'}`);

  if (q.trim()) url.searchParams.set('q', q.trim());
  else {
    url.searchParams.set('category', 'technology');
    url.searchParams.set('q', 'AI');
  }
  url.searchParams.set('language', lang === 'zh' ? 'zh' : 'en');
  url.searchParams.set('page', String(Math.max(1, page)));
  url.searchParams.set('pageSize', String(Math.min(100, Math.max(1, pageSize))));
  url.searchParams.set('sortBy', 'publishedAt');

  const json = await fetchJson(url.toString(), {
    label: 'newsapi',
    timeoutMs: config.request.timeoutMs,
    retry: config.request.retry,
    headers: { 'X-Api-Key': config.newsapiApiKey },
  });

  const articles = normalizeResponse(json);
  return { articles, total: json.totalResults ?? articles.length, upstreamPaged: true, failed: [], sourcesUsed: 1 };
}

export async function search(q, options = {}) {
  return fetchLatest({ ...options, q });
}

export default { name, fetchLatest, search };
