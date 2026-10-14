/**
 * 默认新闻源：多路 RSS 聚合。
 * 免密钥、可直连，是所有 provider 里的兜底方案。
 */
import config from '../config.js';
import { fetchText, settleAll } from '../lib/httpClient.js';
import logger from '../lib/logger.js';
import { parseFeed } from '../lib/rssParser.js';
import { dedupe, normalizeArticle, sortByDateDesc } from './normalize.js';
import { SOURCES, SOURCE_MAP } from './sources.js';

export const name = 'rss';

/**
 * 抓取单个源。deadline 是整轮聚合的硬预算：
 * 剩余时间不足时直接判失败，避免某个慢源把所有请求拖到超时。
 */
async function fetchSource(source, deadline, maxAgeMs) {
  const remaining = deadline - Date.now();
  if (remaining < 800) throw new Error('聚合时间预算耗尽，已跳过该源');

  const xml = await fetchText(source.url, {
    label: `rss:${source.id}`,
    timeoutMs: Math.min(config.request.feedTimeoutMs, remaining),
    retry: config.request.retry,
  });

  const { items } = parseFeed(xml, { feedUrl: source.url, feedTitle: source.name, defaultSource: source.name });
  const articles = sortByDateDesc(
    items
      .map((item) =>
        normalizeArticle(
          { ...item, sourceName: source.name, sourceId: source.id, lang: source.lang },
          { provider: 'rss', source, trustAI: source.trustAI },
        ),
      )
      .filter(Boolean),
  )
    // 只保留最新的 N 条：官方博客 RSS 常含多年历史，会把时间线冲淡
    .slice(0, config.news.maxItemsPerSource)
    // 时效窗口：太老的新闻不进「最新新闻」流
    .filter((article) => Date.now() - (Date.parse(article.publishedAt) || 0) <= maxAgeMs);

  return { source, articles };
}

/**
 * 抓取全部(或指定)订阅源。
 * 单个源失败不影响整体 —— 这是聚合器最重要的健壮性要求。
 * @param {{sourceIds?:string[]}} options
 */
export async function fetchLatest(options = {}) {
  const targets = options.sourceIds?.length
    ? options.sourceIds.map((id) => SOURCE_MAP.get(id)).filter(Boolean)
    : SOURCES;
  const maxAgeMs = config.news.maxAgeDays * 24 * 60 * 60 * 1000;
  const deadline = Date.now() + config.request.feedBudgetMs;

  const { values, failures } = await settleAll(
    targets.map((source) => fetchSource(source, deadline, maxAgeMs)),
  );

  const articles = sortByDateDesc(dedupe(values.flatMap((entry) => entry.articles)));

  const failed = failures.map((failure) => ({
    source: targets[failure.index]?.id || `#${failure.index}`,
    message: failure.message,
  }));
  if (failed.length) logger.warn('rss partial failure', { failed: failed.length, total: targets.length, failed });

  return { articles, failed, sourcesUsed: values.length };
}

export default { name, fetchLatest };
