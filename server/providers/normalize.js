/**
 * 把各上游的异构数据统一成前端使用的 Article 结构。
 * 所有 provider 都必须经过这里，保证前端只面对一种数据形状。
 */
import { classifyArticle, isAiRelated, SOURCE_MAP } from './sources.js';
import {
  cleanText,
  estimateReadingMinutes,
  hostnameOf,
  safeUrl,
  stableId,
  stripSourceSuffix,
  truncate,
} from '../lib/textUtils.js';

export const CATEGORY_LABELS = {
  all: '全部',
  llm: '大模型',
  product: '产品应用',
  agent: '智能体',
  research: '研究论文',
  business: '商业融资',
  hardware: '算力硬件',
  opensource: '开源生态',
  policy: '政策监管',
  safety: '安全对齐',
  other: '其他',
};

/** RSS 里常见的无信息量占位摘要(前缀匹配即可，"点击查看原文>" 这类带尾符号也算) */
const BOILERPLATE_EXCERPT =
  /^(点击查看原文|点击阅读原文|阅读原文|阅读全文|查看全文|点击查看|详见原文|更多内容|详情请|read more|continue reading|click (here )?to read|view (the )?full (article|post)|the post .* appeared first on)/i;

/**
 * 摘要有意义的最短长度。
 * 注意不要设太高：量子位这类源的摘要是「一次采集，反复使用」这样的短副标题，
 * 它们比留空更有信息量，必须保留。
 */
const MIN_EXCERPT_LENGTH = 8;

/**
 * 清洗用于列表展示的摘要：
 * 太短的、纯样板文案的一律置空，避免卡片上出现「点击查看原文」这种噪声。
 */
function cleanExcerpt(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length < MIN_EXCERPT_LENGTH) return '';
  if (BOILERPLATE_EXCERPT.test(value)) return '';
  return truncate(value, 260);
}

/**
 * 清洗用于 AI 输入与详情页正文区的摘要。
 * 与 cleanExcerpt 同源：纯样板文案(如 InfoQ 的「点击查看原文」)直接丢弃，
 * 让 AI 走正文抽取分支，而不是拿一句废话去总结。
 */
function cleanSummary(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length < MIN_EXCERPT_LENGTH) return '';
  if (BOILERPLATE_EXCERPT.test(value)) return '';
  return truncate(value, 1200);
}

/**
 * @param {object} raw 上游原始条目
 * @param {{provider:string, source?:object, trustAI?:boolean}} context
 * @returns {object|null} 规范化后的 Article，若无效返回 null
 */
export function normalizeArticle(raw, context) {
  const url = safeUrl(raw.url || raw.link || '');
  const title = stripSourceSuffix(cleanText(raw.title || ''), raw.sourceName || context.source?.name);
  if (!url || !title) return null;

  const sourceMeta = context.source || SOURCE_MAP.get(raw.sourceId) || null;
  const sourceName = raw.sourceName || sourceMeta?.name || hostnameOf(url) || '未知来源';
  const summary = cleanText(raw.description || raw.excerpt || raw.content || '');
  const trustAI = context.trustAI ?? sourceMeta?.trustAI ?? true;

  // 综合科技源必须命中 AI 关键词，否则丢弃，保证「AI 新闻」纯度
  if (!trustAI && !isAiRelated(title, summary)) return null;

  const { category, tags } = classifyArticle(title, summary);

  return {
    id: stableId(url),
    title,
    url,
    excerpt: cleanExcerpt(raw.excerpt || summary),
    summary: cleanSummary(summary),
    image: safeUrl(raw.image || '') || '',
    author: cleanText(raw.author || ''),
    publishedAt: raw.publishedAt || new Date().toISOString(),
    source: {
      id: sourceMeta?.id || raw.sourceId || hostnameOf(url),
      name: sourceName,
      lang: sourceMeta?.lang || (raw.lang ?? 'en'),
      homepage: sourceMeta?.homepage || '',
    },
    host: hostnameOf(url),
    category,
    categoryLabel: CATEGORY_LABELS[category] || '其他',
    tags,
    readingMinutes: estimateReadingMinutes(summary),
    provider: context.provider,
    // content 只用于服务端做 AI 总结，不进列表接口(见 toListItem)
    _content: raw.content ? truncate(cleanText(raw.content), 6000) : '',
  };
}

/** 列表接口用的精简结构：去掉 content，减小载荷 */
export function toListItem(article) {
  const { _content, ...rest } = article;
  return rest;
}

/** 详情接口用的结构：附带 content 长度提示，不直接回传全文 */
export function toDetailItem(article) {
  const { _content, ...rest } = article;
  return { ...rest, hasFullContent: Boolean(_content && _content.length > 400) };
}

/** 按 URL / 标题去重，保留时间更新的那条 */
export function dedupe(articles) {
  const byUrl = new Map();
  const seenTitles = new Set();
  for (const article of articles) {
    const urlKey = article.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (byUrl.has(urlKey)) continue;
    const titleKey = article.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 60);
    if (titleKey && seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    byUrl.set(urlKey, article);
  }
  return [...byUrl.values()];
}

export function sortByDateDesc(articles) {
  return [...articles].sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || 0;
    const tb = Date.parse(b.publishedAt) || 0;
    return tb - ta;
  });
}

/** 跨分类 / 关键词 / 来源 / 时间的统一过滤 */
export function filterArticles(articles, { category, q, source, sources, since, lang } = {}) {
  const keyword = (q || '').trim().toLowerCase();
  const sinceTs = since ? Date.parse(since) : 0;
  const sourceSet = Array.isArray(sources) && sources.length ? new Set(sources) : null;

  return articles.filter((article) => {
    if (category && category !== 'all' && article.category !== category) return false;
    if (source && article.source.id !== source) return false;
    if (sourceSet && !sourceSet.has(article.source.id)) return false;
    if (lang && article.source.lang !== lang) return false;
    if (sinceTs && (Date.parse(article.publishedAt) || 0) < sinceTs) return false;
    if (keyword) {
      const haystack = `${article.title} ${article.summary} ${article.tags.join(' ')} ${article.source.name}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}
