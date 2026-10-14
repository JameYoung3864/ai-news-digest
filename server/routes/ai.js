/**
 * AI 相关 API 路由。
 * 密钥只在这一层被使用，任何响应里都不会出现 key(见 routes/meta.js 白名单)。
 */
import express from 'express';
import config from '../config.js';
import { badRequest } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { normalizeArticle } from '../providers/normalize.js';
import { askAboutArticle, aiCacheStats, clearAiCache, summarizeArticle } from '../services/aiSummary.js';
import { getArticle, remember } from '../services/articleStore.js';

const router = express.Router();

/**
 * 解析请求里的文章来源，两种方式都支持：
 * 1) articleId —— 服务端缓存里有(正常列表点进来)
 * 2) article   —— 前端本地缓存兜底(服务重启后从收藏/历史进入)
 */
function resolveArticle(payload = {}) {
  const { articleId, article } = payload;

  if (articleId) {
    const found = getArticle(String(articleId));
    if (found) return found;
    if (!article) {
      throw badRequest('服务端缓存中找不到该文章(可能已过期)，请同时传入 article 内容', {
        code: 'ARTICLE_NOT_CACHED',
        articleId,
      });
    }
  }

  if (!article || typeof article !== 'object') {
    throw badRequest('必须提供 articleId 或 article 对象');
  }

  const normalized = normalizeArticle(
    {
      title: String(article.title || '').slice(0, 500),
      url: String(article.url || ''),
      description: String(article.summary || article.excerpt || '').slice(0, 8000),
      content: String(article.content || '').slice(0, 8000),
      image: String(article.image || ''),
      author: String(article.author || ''),
      publishedAt: article.publishedAt,
      sourceName: String(article.source?.name || article.sourceName || ''),
      sourceId: article.source?.id,
    },
    { provider: 'client', trustAI: true },
  );

  if (!normalized) throw badRequest('article 缺少合法的 title / url 字段');
  remember(normalized);
  return normalized;
}

/** POST /api/ai/summarize { articleId | article, language?, force? } */
router.post(
  '/summarize',
  asyncHandler(async (req, res) => {
    const article = resolveArticle(req.body || {});
    const language = req.body?.language === 'en' ? 'en' : 'zh';
    const result = await summarizeArticle({ article, language, force: Boolean(req.body?.force) });
    res.json(result);
  }),
);

/** POST /api/ai/ask { articleId | article, question } */
router.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const article = resolveArticle(req.body || {});
    const question = String(req.body?.question || '').slice(0, 500);
    const result = await askAboutArticle({ article, question, language: req.body?.language });
    res.json({ ...result, articleId: article.id });
  }),
);

/** GET /api/ai/status —— 前端据此决定是否展示「AI 未配置」提示 */
router.get('/status', (req, res) => {
  res.json({
    enabled: config.aiMock || Boolean(config.deepseek.apiKey),
    mock: config.aiMock,
    model: config.deepseek.model,
    configured: Boolean(config.deepseek.apiKey),
    cache: aiCacheStats(),
    rateLimit: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.aiMax },
  });
});

/** POST /api/ai/cache/clear —— 开发/调试用，生产环境关闭 */
router.post(
  '/cache/clear',
  asyncHandler(async (req, res) => {
    if (config.isProduction) throw badRequest('生产环境不允许清空缓存');
    res.json({ cleared: clearAiCache(), cache: aiCacheStats() });
  }),
);

export default router;
