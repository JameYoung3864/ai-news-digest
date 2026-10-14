/**
 * 新闻聚合服务 —— 应用层的核心。
 *
 * 职责：
 * 1. 选择 / 降级 provider（GNews/NewsAPI 挂了自动切回 RSS，用户无感）。
 * 2. 缓存上游结果，做分类、搜索、分页、来源过滤。
 * 3. 把文章写入内存仓库，供详情页按 id 反查。
 */
import config from '../config.js';
import { cacheSet, cacheWrap } from '../lib/cache.js';
import { badRequest, notFound } from '../lib/errors.js';
import logger from '../lib/logger.js';
import {
  dedupe,
  filterArticles,
  normalizeArticle,
  sortByDateDesc,
  toDetailItem,
  toListItem,
} from '../providers/normalize.js';
import { getProvider, resolveProvider } from '../providers/index.js';
import { SOURCES, CATEGORIES } from '../providers/sources.js';
import { getArticle, remember, rememberMany, storeSize } from './articleStore.js';

const RSS_POOL_KEY = 'news:rss:pool';
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 12;

function clampPage(page) {
  const parsed = Number.parseInt(page, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clampPageSize(pageSize) {
  const parsed = Number.parseInt(pageSize, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, parsed);
}

/** 支持 sources=a,b,c 形式的多来源筛选 */
function normalizeSources(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasMore: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

/** 分类计数，用于首页 Tab 上的数字角标 */
export function categoryCounts(articles) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category.key, 0]));
  counts.all = articles.length;
  for (const article of articles) {
    if (counts[article.category] !== undefined) counts[article.category] += 1;
  }
  return counts;
}

/** 拉取并缓存 RSS 大池子（所有本地过滤/搜索都基于它） */
async function getRssPool({ refresh = false } = {}) {
  if (refresh) {
    // 传入 force 时不走缓存：直接构造一次新结果
    const fresh = await getProvider('rss').fetchLatest();
    rememberMany(fresh.articles);
    cacheSet(RSS_POOL_KEY, fresh, config.cache.newsTtlMs, config.cache.maxEntries);
    return fresh;
  }
  const pool = await cacheWrap(RSS_POOL_KEY, () => getProvider('rss').fetchLatest(), {
    ttlMs: config.cache.newsTtlMs,
    maxEntries: config.cache.maxEntries,
  });
  rememberMany(pool.articles || []);
  return pool;
}

/**
 * 首页 / 分类新闻流。
 * @param {{category?:string, q?:string, page?:number, pageSize?:number, source?:string, lang?:string, provider?:string, refresh?:boolean}} params
 */
export async function getFeed(params = {}) {
  const category = params.category || 'all';
  const q = (params.q || '').trim();
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const requestedProvider = resolveProvider(params.provider);

  const filters = {
    category,
    q,
    source: params.source,
    sources: normalizeSources(params.sources),
    lang: params.lang,
  };
  const updatedAt = new Date().toISOString();
  const failedSources = [];
  let fallbackFrom = null;
  let stale = false;
  let provider = requestedProvider;
  let approximateFiltering = false;
  let items = [];
  let total = null;
  let upstreamPaged = false;

  if (requestedProvider !== 'rss') {
    const cacheKey = `news:${requestedProvider}:${category}:${q}:${page}:${pageSize}:${params.lang || 'any'}`;
    try {
      const result = await cacheWrap(
        cacheKey,
        () =>
          getProvider(requestedProvider).fetchLatest({
            category,
            q,
            page,
            pageSize,
            lang: params.lang,
          }),
        { ttlMs: config.cache.newsTtlMs, maxEntries: config.cache.maxEntries },
      );
      items = result.articles || [];
      total = result.total ?? items.length;
      upstreamPaged = Boolean(result.upstreamPaged);
      stale = Boolean(result._stale);
      failedSources.push(...(result.failed || []));

      // GNews/NewsAPI 的分类粒度粗，需要本地再筛一遍(数量可能少于 pageSize，属预期)
      if (category !== 'all' || params.source) {
        const filtered = filterArticles(items, filters);
        approximateFiltering = filtered.length !== items.length;
        items = filtered;
      }
      rememberMany(items);
    } catch (error) {
      // 关键降级路径：上游不可用时用 RSS 兜底，而不是给用户一个错误页
      logger.warn('provider failed, falling back to rss', { provider: requestedProvider, message: error.message });
      fallbackFrom = { provider: requestedProvider, message: error.message };
      provider = 'rss';
    }
  }

  if (provider === 'rss') {
    const pool = await getRssPool({ refresh: params.refresh });
    stale = Boolean(pool._stale);
    failedSources.push(...(pool.failed || []));
    const all = pool.articles || [];

    // 先应用「来源 / 语言 / 关键词」筛选，再按分类切分：
    // 这样 Tab 上的数字与当前筛选条件始终一致。
    const scoped = filterArticles(all, { ...filters, category: undefined });
    const filtered = category === 'all' ? scoped : scoped.filter((article) => article.category === category);
    const paged = paginate(filtered, page, pageSize);

    return {
      ...paged,
      // 列表接口一律剥离正文，正文只在服务端用于 AI 总结
      items: paged.items.map(toListItem),
      meta: {
        provider: 'rss',
        providerLabel: 'RSS 聚合(免密钥)',
        upstreamPaged: false,
        approximateFiltering: false,
        fallbackFrom,
        stale,
        failedSources,
        updatedAt,
        sourceFilter: params.sources?.length ? params.sources : null,
        categoryCounts: categoryCounts(scoped),
      },
    };
  }

  // 上游已分页的情况：直接透传分页元信息
  const paginated = upstreamPaged
    ? {
        items,
        pagination: {
          page,
          pageSize,
          total: total ?? items.length,
          totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : page + (items.length >= pageSize ? 1 : 0),
          hasMore: items.length >= pageSize,
          hasPrev: page > 1,
        },
      }
    : paginate(items, page, pageSize);

  return {
    ...paginated,
    items: paginated.items.map(toListItem),
    meta: {
      provider,
      providerLabel: provider === 'gnews' ? 'GNews API' : 'NewsAPI',
      upstreamPaged: true,
      approximateFiltering,
      fallbackFrom,
      stale,
      failedSources,
      updatedAt,
      categoryCounts: null,
    },
  };
}

/**
 * 跨源搜索：本地聚合池 + Hacker News 社区 + GNews(若配置)。
 * 结果整体缓存 5 分钟，保证翻页时集合稳定。
 */
export async function search(params = {}) {
  const q = (params.q || '').trim();
  if (!q) throw badRequest('搜索关键词 q 不能为空');

  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const category = params.category || 'all';
  const searchKey = `search:${q.toLowerCase()}:${category}:${params.lang || 'any'}:${params.source || 'any'}:${normalizeSources(params.sources).join('|')}`;

  const collected = await cacheWrap(
    searchKey,
    async () => {
      const groups = [];
      const failures = [];

      // 1) 本地 RSS 池
      try {
        const pool = await getRssPool();
        const matched = filterArticles(pool.articles || [], {
          category,
          q,
          source: params.source,
          sources: normalizeSources(params.sources),
          lang: params.lang,
        }).slice(0, 60);
        groups.push({ source: 'local', label: '已聚合新闻', items: matched });
      } catch (error) {
        failures.push({ source: 'local', message: error.message });
      }

      // 2) GNews 全网搜索(有 key 才有意义)
      if (config.gnewsApiKey && params.includeExternal !== false) {
        try {
          const external = await getProvider('gnews').search(q, { page: 1, pageSize: 10, lang: params.lang });
          groups.push({ source: 'gnews', label: 'GNews 全网', items: external.articles || [] });
        } catch (error) {
          failures.push({ source: 'gnews', message: error.message });
        }
      }

      // 3) Hacker News 社区讨论
      if (params.includeCommunity !== false) {
        try {
          const community = await getProvider('hackernews').search(q, { page: 1, pageSize: 30 });
          groups.push({ source: 'hackernews', label: 'Hacker News', items: community.articles || [] });
        } catch (error) {
          failures.push({ source: 'hackernews', message: error.message });
        }
      }

      const merged = sortByDateDesc(dedupe(groups.flatMap((group) => group.items)));
      const groupCounts = Object.fromEntries(groups.map((group) => [group.source, group.items.length]));
      return { items: merged, groupCounts, failures, searchedAt: new Date().toISOString() };
    },
    { ttlMs: Math.min(config.cache.newsTtlMs, 300_000), maxEntries: config.cache.maxEntries, allowStaleOnError: false },
  );

  rememberMany(collected.items);
  const paged = paginate(collected.items, page, pageSize);

  return {
    ...paged,
    items: paged.items.map(toListItem),
    meta: {
      query: q,
      groupCounts: collected.groupCounts,
      failedSources: collected.failures,
      searchedAt: collected.searchedAt,
      externalEnabled: Boolean(config.gnewsApiKey),
    },
  };
}

/** 详情：按 id 反查内存仓库 */
export async function getArticleById(id) {
  if (!id) throw badRequest('缺少文章 id');
  const article = getArticle(id);
  if (!article) {
    throw notFound('该新闻已不在服务端缓存中(缓存 TTL 到期或服务已重启)，请返回列表重新打开');
  }
  return { article: toDetailItem(article), listItem: toListItem(article) };
}

/** 按 URL 反查（前端从收藏/历史进入时可用） */
export async function findArticleByUrl(url) {
  if (!url) throw badRequest('缺少 url 参数');
  const pool = await getRssPool();
  const target = url.replace(/[?#].*$/, '').replace(/\/$/, '');
  const found = (pool.articles || []).find((a) => a.url.replace(/[?#].*$/, '').replace(/\/$/, '') === target);
  if (!found) throw notFound('未在缓存中找到该 URL 对应的新闻');
  return found;
}

export function listSources() {
  return SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    lang: source.lang,
    homepage: source.homepage,
    url: source.url,
    trustAI: source.trustAI,
  }));
}

export function serviceStats() {
  return { cachedArticles: storeSize() };
}

export { CATEGORIES };
export default { getFeed, search, getArticleById };
