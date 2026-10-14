/**
 * 集中式配置：读取 .env 并做归一化 / 校验。
 *
 * 安全约定：本文件导出的任何密钥字段都只在服务端使用，
 * 绝不允许直接序列化返回给浏览器(见 routes/config.js 的白名单)。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/** 加载 .env(Node 20.12+ 内置，无需 dotenv 依赖) */
function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return false;
  try {
    process.loadEnvFile(envPath);
    return true;
  } catch {
    // 老版本 Node 回退：手工解析 KEY=VALUE
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
    return true;
  }
}

const envFileLoaded = loadEnvFile();

const str = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const num = (key, fallback) => {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const bool = (key, fallback = false) => {
  const value = str(key, String(fallback)).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
};

export const config = {
  envFileLoaded,
  isProduction: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 3000),
  host: str('HOST', '127.0.0.1'),

  newsProvider: str('NEWS_PROVIDER', 'rss').toLowerCase(),

  gnewsApiKey: str('GNEWS_API_KEY'),
  newsapiApiKey: str('NEWSAPI_API_KEY'),

  deepseek: {
    apiKey: str('DEEPSEEK_API_KEY'),
    baseUrl: str('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: str('DEEPSEEK_MODEL', 'deepseek-chat'),
  },

  aiMock: bool('AI_MOCK', false),

  request: {
    timeoutMs: num('REQUEST_TIMEOUT_MS', 12_000),
    // 重试次数(不含首次请求)
    retry: num('REQUEST_RETRY', 1),
    // 单个 RSS 源超时
    feedTimeoutMs: num('FEED_TIMEOUT_MS', 10_000),
    // 整轮聚合的硬预算：到点就用已拿到的部分返回，绝不让某个慢源拖死首屏
    feedBudgetMs: num('FEED_BUDGET_MS', 18_000),
  },

  cache: {
    newsTtlMs: num('NEWS_CACHE_TTL_MS', 300_000),
    aiTtlMs: num('AI_CACHE_TTL_MS', 86_400_000),
    maxEntries: 500,
  },

  news: {
    // 单个源最多保留多少条(OpenAI 等官方博客会把 2017 年的文章也塞进 RSS)
    maxItemsPerSource: num('MAX_ITEMS_PER_SOURCE', 40),
    // 超过这个天数的新闻不进聚合池
    maxAgeDays: num('MAX_ARTICLE_AGE_DAYS', 180),
  },

  enableArticleExtract: bool('ENABLE_ARTICLE_EXTRACT', true),

  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
    max: num('RATE_LIMIT_MAX', 120),
    aiMax: num('AI_RATE_LIMIT_MAX', 15),
  },
};

/** 对外可见的能力描述(不含任何密钥) */
export function publicCapabilities() {
  return {
    provider: effectiveProvider(),
    availableProviders: availableProviders(),
    ai: {
      enabled: config.aiMock || Boolean(config.deepseek.apiKey),
      mock: config.aiMock,
      model: config.deepseek.model,
      reason: config.aiMock
        ? 'AI_MOCK=1，当前返回演示数据'
        : config.deepseek.apiKey
          ? 'DeepSeek 已配置'
          : '未配置 DEEPSEEK_API_KEY，AI 总结不可用',
    },
    articleExtract: config.enableArticleExtract,
    envFileLoaded: config.envFileLoaded,
  };
}

export function availableProviders() {
  const list = ['rss'];
  if (config.gnewsApiKey) list.push('gnews');
  if (config.newsapiApiKey) list.push('newsapi');
  return list;
}

export function effectiveProvider() {
  const requested = config.newsProvider;
  if (requested === 'gnews' && config.gnewsApiKey) return 'gnews';
  if (requested === 'newsapi' && config.newsapiApiKey) return 'newsapi';
  if (requested === 'rss') return 'rss';
  if (requested === 'auto') {
    if (config.gnewsApiKey) return 'gnews';
    if (config.newsapiApiKey) return 'newsapi';
  }
  return 'rss';
}

export default config;
