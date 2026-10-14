/**
 * 前端 API 客户端。
 * 只请求同源的 /api/*，永远不接触任何第三方密钥。
 */

export class ApiError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 0, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT = 25_000;

function buildUrl(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request(path, { method = 'GET', params, body, timeoutMs = DEFAULT_TIMEOUT, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const composite = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const response = await fetch(buildUrl(path, params), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: composite,
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = payload?.error || {};
      throw new ApiError(error.message || `请求失败(${response.status})`, {
        code: error.code || `HTTP_${response.status}`,
        status: response.status,
        details: error.details,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', { code: 'TIMEOUT' });
    }
    throw new ApiError('网络异常，无法连接到服务器', { code: 'NETWORK_ERROR' });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /** 服务端能力与分类配置 */
  getConfig: () => request('/api/config'),

  getHealth: () => request('/api/health'),

  /** 新闻流 */
  getFeed: (params, options) => request('/api/news/feed', { params, ...options }),

  /** 跨源搜索 */
  search: (params, options) => request('/api/news/search', { params, ...options }),

  /** 详情 */
  getArticle: (id) => request(`/api/news/article/${encodeURIComponent(id)}`),

  getSources: () => request('/api/news/sources'),

  /** AI */
  summarize: (payload, options) => request('/api/ai/summarize', { method: 'POST', body: payload, timeoutMs: 60_000, ...options }),

  ask: (payload, options) => request('/api/ai/ask', { method: 'POST', body: payload, timeoutMs: 45_000, ...options }),

  aiStatus: () => request('/api/ai/status'),

  clearAiCache: () => request('/api/ai/cache/clear', { method: 'POST' }),
};

export default api;
