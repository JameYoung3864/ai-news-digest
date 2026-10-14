/**
 * 服务入口：Express 应用装配 + 启动。
 *
 * 安全要点：
 * - 静态目录只暴露 public/，server/ 与 .env 永远不会被下载。
 * - 所有第三方调用(新闻 API / DeepSeek)都发生在服务端，浏览器只同源请求 /api/*。
 */
import express from 'express';
import config, { PUBLIC_DIR, publicCapabilities } from './config.js';
import logger from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import rateLimit from './middleware/rateLimit.js';
import aiRoutes from './routes/ai.js';
import metaRoutes from './routes/meta.js';
import newsRoutes from './routes/news.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '256kb' }));

// 访问日志(极简)
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      logger.info('http', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    }
  });
  next();
});

// 全局限流
app.use(
  '/api',
  rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, bucket: 'api' }),
);

// AI 接口单独更严格的限流(花 token)
app.use(
  '/api/ai',
  rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.aiMax, bucket: 'ai' }),
  aiRoutes,
);

app.use('/api/news', newsRoutes);
app.use('/api', metaRoutes);

// 显式拒绝敏感路径：不允许源码 / 环境变量 / 依赖目录通过 HTTP 暴露
const BLOCKED_PREFIXES = ['/server', '/scripts', '/node_modules', '/.git', '/.npm-cache', '/logs'];
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  if (
    BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
    path === '/.env' ||
    path.startsWith('/.env.') ||
    path === '/package.json' ||
    path === '/package-lock.json' ||
    path.includes('..')
  ) {
    logger.warn('blocked sensitive path', { path: req.path, ip: req.ip });
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: '资源不存在' } });
  }
  return next();
});

// 静态前端
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      // 本项目零构建、直接改源码即生效，因此 JS/CSS/HTML 一律走协商缓存(ETag/304)，
      // 避免改了源码却因为强缓存看到旧页面。
      if (/\.(html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }),
);

// SPA 兜底：非 /api 的 GET 一律返回 index.html，让前端路由接管
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  return res.sendFile('index.html', { root: PUBLIC_DIR });
});

app.use('/api', notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  const capabilities = publicCapabilities();
  logger.info('server started', {
    url: `http://${config.host}:${config.port}`,
    newsProvider: capabilities.provider,
    aiEnabled: capabilities.ai.enabled,
    aiMock: capabilities.ai.mock,
    envFileLoaded: config.envFileLoaded,
  });

  if (!capabilities.ai.enabled) {
    logger.warn('DEEPSEEK_API_KEY 未配置：AI 总结将返回演示数据(AI_MOCK=1 亦可)');
  }
});

function shutdown(signal) {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
