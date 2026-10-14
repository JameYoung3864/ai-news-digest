/**
 * 元信息路由：/api/config 是前端唯一能拿到的「服务端能力」入口。
 * 这里严格白名单输出，任何密钥都不可能出现在响应中。
 */
import express from 'express';
import config, { publicCapabilities } from '../config.js';
import { cacheStats } from '../lib/cache.js';
import { CATEGORIES, listSources, serviceStats } from '../services/newsService.js';

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    capabilities: publicCapabilities(),
    categories: CATEGORIES,
    sources: listSources(),
    defaults: {
      pageSize: 12,
      language: 'zh',
      provider: config.newsProvider,
    },
    limits: {
      maxPageSize: 50,
      rateLimit: config.rateLimit,
    },
    version: '1.0.0',
  });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
    node: process.version,
    envFileLoaded: config.envFileLoaded,
    cache: { ...cacheStats(), keys: undefined },
    store: serviceStats(),
  });
});

export default router;
