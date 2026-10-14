/**
 * 客户端状态层：设置 / 收藏 / 历史 / 摘要缓存。
 * 全部存 localStorage —— 无需登录，刷新不丢，且不上传任何个人数据。
 * 变化通过事件广播，顶部导航的计数徽标据此实时更新。
 */
import { loadJson, saveJson } from './utils.js';

const KEYS = {
  settings: 'ainews.settings',
  favorites: 'ainews.favorites',
  history: 'ainews.history',
  summaries: 'ainews.summaries',
};

export const DEFAULT_SETTINGS = {
  theme: 'system', // system | dark | light
  pageSize: 12,
  defaultCategory: 'all',
  language: 'zh', // AI 总结语言
  autoSummarize: true, // 打开详情页自动生成总结
  hideCommunity: false, // 搜索时是否排除 Hacker News
  compactCards: false, // 列表隐藏配图
  sourcesFilter: [], // 只显示这些来源(空 = 全部)
};

const HISTORY_LIMIT = 120;
const SUMMARY_LIMIT = 200;

class Store extends EventTarget {
  constructor() {
    super();
    this.settings = { ...DEFAULT_SETTINGS, ...loadJson(KEYS.settings, {}) };
    this.favorites = loadJson(KEYS.favorites, []);
    this.history = loadJson(KEYS.history, []);
    this.summaries = loadJson(KEYS.summaries, {});
    this.capabilities = null;
    this.categories = [];
    this.sources = [];
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /* ---------- 设置 ---------- */
  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveJson(KEYS.settings, this.settings);
    this.applyTheme();
    this.emit('settings:changed', this.settings);
    return this.settings;
  }

  applyTheme() {
    const preference = this.settings.theme;
    const resolved =
      preference === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : preference;
    document.documentElement.dataset.theme = resolved;
    return resolved;
  }

  /* ---------- 元信息 ---------- */
  setBootstrap({ capabilities, categories, sources }) {
    if (capabilities) this.capabilities = capabilities;
    if (categories?.length) this.categories = categories;
    if (sources?.length) this.sources = sources;
  }

  /* ---------- 收藏 ---------- */
  isFavorite(id) {
    return this.favorites.some((item) => item.id === id);
  }

  toggleFavorite(article) {
    const exists = this.isFavorite(article.id);
    if (exists) {
      this.favorites = this.favorites.filter((item) => item.id !== article.id);
    } else {
      this.favorites = [{ ...this.snapshot(article), addedAt: new Date().toISOString() }, ...this.favorites];
    }
    saveJson(KEYS.favorites, this.favorites);
    this.emit('favorites:changed', { id: article.id, added: !exists, count: this.favorites.length });
    return !exists;
  }

  removeFavorite(id) {
    this.favorites = this.favorites.filter((item) => item.id !== id);
    saveJson(KEYS.favorites, this.favorites);
    this.emit('favorites:changed', { id, added: false, count: this.favorites.length });
  }

  clearFavorites() {
    this.favorites = [];
    saveJson(KEYS.favorites, this.favorites);
    this.emit('favorites:changed', { id: null, added: false, count: 0 });
  }

  /* ---------- 历史 ---------- */
  recordView(article) {
    const entry = { ...this.snapshot(article), viewedAt: new Date().toISOString() };
    this.history = [entry, ...this.history.filter((item) => item.id !== article.id)].slice(0, HISTORY_LIMIT);
    saveJson(KEYS.history, this.history);
    this.emit('history:changed', { count: this.history.length });
  }

  clearHistory() {
    this.history = [];
    saveJson(KEYS.history, this.history);
    this.emit('history:changed', { count: 0 });
  }

  removeHistory(id) {
    this.history = this.history.filter((item) => item.id !== id);
    saveJson(KEYS.history, this.history);
    this.emit('history:changed', { count: this.history.length });
  }

  /* ---------- 摘要缓存(省 token 的第二道防线) ---------- */
  getSummary(id, language) {
    return this.summaries[`${id}:${language}`] || null;
  }

  putSummary(id, language, payload) {
    const key = `${id}:${language}`;
    this.summaries[key] = payload;
    const keys = Object.keys(this.summaries);
    if (keys.length > SUMMARY_LIMIT) {
      for (const oldKey of keys.slice(0, keys.length - SUMMARY_LIMIT)) delete this.summaries[oldKey];
    }
    saveJson(KEYS.summaries, this.summaries);
  }

  clearSummaries() {
    this.summaries = {};
    saveJson(KEYS.summaries, this.summaries);
  }

  clearAll() {
    this.clearFavorites();
    this.clearHistory();
    this.clearSummaries();
  }

  /** 只保留渲染需要的字段，避免 localStorage 被正文撑爆 */
  snapshot(article) {
    return {
      id: article.id,
      title: article.title,
      url: article.url,
      excerpt: article.excerpt,
      summary: article.summary,
      image: article.image,
      author: article.author,
      publishedAt: article.publishedAt,
      source: article.source,
      host: article.host,
      category: article.category,
      categoryLabel: article.categoryLabel,
      tags: article.tags,
      readingMinutes: article.readingMinutes,
    };
  }

  stats() {
    return {
      favorites: this.favorites.length,
      history: this.history.length,
      summaries: Object.keys(this.summaries).length,
      bytes: (() => {
        try {
          return Object.values(KEYS).reduce((sum, key) => sum + (localStorage.getItem(key)?.length || 0), 0);
        } catch {
          return 0;
        }
      })(),
    };
  }
}

export const store = new Store();
export default store;
