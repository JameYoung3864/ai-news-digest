/** 通用工具：DOM、格式化、存储、事件。无依赖。 */

/* ---------- DOM ---------- */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** 用 HTML 字符串设置内容(调用方负责用 escapeHtml 转义外部数据) */
export function setHtml(target, html) {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = html;
  return el;
}

export function on(target, event, selector, handler) {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return () => {};
  const listener = (e) => {
    const match = e.target.closest(selector);
    if (match && el.contains(match)) handler(e, match);
  };
  el.addEventListener(event, listener);
  return () => el.removeEventListener(event, listener);
}

/* ---------- 文本 ---------- */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(value, max = 120) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* ---------- 时间 ---------- */
export function fmtRelative(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 0) return fmtDateTime(iso);
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return fmtDate(iso);
}

export function fmtDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function fmtDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fmtNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
}

/* ---------- 函数 ---------- */
export function debounce(fn, wait = 300) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, wait = 200) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

/* ---------- 存储 ---------- */
export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    // 配额超限时静默降级，不影响阅读
    console.warn('localStorage 写入失败', error);
    return false;
  }
}

/* ---------- 其它 ---------- */
export const CATEGORY_ICONS = {
  all: '🌐',
  llm: '🧠',
  product: '🚀',
  agent: '🤖',
  research: '📄',
  business: '💰',
  hardware: '⚡',
  opensource: '🧩',
  policy: '⚖️',
  safety: '🛡️',
  other: '📰',
};

export const SENTIMENT_LABELS = {
  positive: { text: '偏乐观', icon: '📈' },
  neutral: { text: '中性', icon: '➖' },
  negative: { text: '偏谨慎', icon: '📉' },
};

export function categoryIcon(key) {
  return CATEGORY_ICONS[key] || '📰';
}

export function downloadFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function highlight(text, keyword) {
  const safe = escapeHtml(text);
  const term = String(keyword || '').trim();
  if (!term) return safe;
  const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark style="background:var(--brand-soft);color:var(--brand);border-radius:3px;padding:0 2px">$1</mark>');
}
