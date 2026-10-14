/**
 * Hacker News(Algolia)适配器 —— 仅用于搜索页补充「技术社区讨论」维度。
 * 免密钥、可直连，作为搜索结果的第二来源。
 */
import config from '../config.js';
import { fetchJson } from '../lib/httpClient.js';
import { safeUrl } from '../lib/textUtils.js';
import { dedupe, normalizeArticle, sortByDateDesc } from './normalize.js';

export const name = 'hackernews';

export async function search(q, { page = 1, pageSize = 10 } = {}) {
  if (!q?.trim()) return { articles: [], total: 0, upstreamPaged: true, failed: [], sourcesUsed: 1 };

  const url = new URL('https://hn.algolia.com/api/v1/search');
  url.searchParams.set('query', q.trim());
  url.searchParams.set('tags', 'story');
  url.searchParams.set('hitsPerPage', String(Math.min(50, Math.max(1, pageSize))));
  url.searchParams.set('page', String(Math.max(0, page - 1)));

  const json = await fetchJson(url.toString(), {
    label: 'hackernews',
    timeoutMs: config.request.timeoutMs,
    retry: 0,
  });

  const articles = sortByDateDesc(
    dedupe(
      (json.hits || [])
        .filter((hit) => hit.title)
        .map((hit) =>
          normalizeArticle(
            {
              title: hit.title,
              url: safeUrl(hit.url) || `https://news.ycombinator.com/item?id=${hit.objectID}`,
              description: hit.story_text || `Hacker News 社区讨论 · ${hit.points || 0} 赞 · ${hit.num_comments || 0} 条评论`,
              author: hit.author,
              publishedAt: hit.created_at,
              sourceName: 'Hacker News',
            },
            { provider: 'hackernews', trustAI: false },
          ),
        )
        .filter(Boolean),
    ),
  );

  return {
    articles,
    total: (json.nbHits ?? articles.length) + (json.nbPages ?? 1),
    upstreamPaged: true,
    failed: [],
    sourcesUsed: 1,
  };
}

export async function fetchLatest(params = {}) {
  return search(params.q || 'AI', params);
}

export default { name, search, fetchLatest };
