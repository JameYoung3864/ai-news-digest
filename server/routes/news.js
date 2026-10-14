/** 新闻相关 API 路由。 */
import express from 'express';
import { badRequest } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { CATEGORIES, getArticleById, getFeed, listSources, search } from '../services/newsService.js';

const router = express.Router();

/** GET /api/news/feed?category=llm&page=1&pageSize=12&q=&source=&lang=&provider=&refresh=1 */
router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const result = await getFeed({
      category: req.query.category,
      q: req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize,
      source: req.query.source,
      // 设置页的来源筛选：sources=qbitai,techcrunch-ai
      sources: req.query.sources,
      lang: req.query.lang,
      provider: req.query.provider,
      refresh: req.query.refresh === '1' || req.query.refresh === 'true',
    });
    res.json({
      ...result,
      items: result.items,
      meta: { ...result.meta, categories: CATEGORIES },
      // 列表接口不回传正文，减小载荷
    });
  }),
);

/** GET /api/news/search?q=agent&page=1&pageSize=12 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) throw badRequest('请提供搜索关键词 q');
    if (q.length > 100) throw badRequest('搜索关键词过长(最多 100 字符)');

    const result = await search({
      q,
      page: req.query.page,
      pageSize: req.query.pageSize,
      category: req.query.category,
      source: req.query.source,
      lang: req.query.lang,
      includeCommunity: req.query.community !== '0',
      includeExternal: req.query.external !== '0',
    });
    res.json({ ...result, meta: { ...result.meta, categories: CATEGORIES } });
  }),
);

/** GET /api/news/article/:id */
router.get(
  '/article/:id',
  asyncHandler(async (req, res) => {
    const result = await getArticleById(req.params.id);
    res.json({ ...result, meta: { categories: CATEGORIES } });
  }),
);

/** GET /api/news/sources —— 给设置页 / 来源筛选器用 */
router.get('/sources', (req, res) => {
  res.json({ sources: listSources() });
});

/** GET /api/news/categories */
router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

export default router;
