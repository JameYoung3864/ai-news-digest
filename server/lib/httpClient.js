/**
 * 带超时 / 重试 / 统一 UA 的 HTTP 客户端。
 * 只依赖 Node 内置 fetch(Node 18+)。
 */
import { AppError, timeoutError, upstreamError } from './errors.js';
import logger from './logger.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return AbortSignal.any(active);
}

/**
 * @param {string} url
 * @param {{headers?:object, timeoutMs?:number, retry?:number, label?:string, accept?:string, signal?:AbortSignal}} options
 * @returns {Promise<Response>}
 */
export async function request(url, options = {}) {
  const {
    headers = {},
    timeoutMs = 12_000,
    retry = 1,
    label = 'upstream',
    accept = '*/*',
    signal,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: accept,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...headers,
        },
        redirect: 'follow',
        signal: combineSignals([timeoutSignal, signal]),
      });

      if (RETRYABLE_STATUS.has(response.status) && attempt < retry) {
        logger.warn('upstream retryable status', { label, status: response.status, attempt });
        await sleep(300 * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw upstreamError(`${label} 返回 ${response.status}`, {
          status: response.status,
          body: body.slice(0, 300),
        });
      }
      return response;
    } catch (error) {
      lastError = error;
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      if (error instanceof AppError) throw error;
      if (attempt < retry) {
        logger.warn('upstream retry after error', { label, message: error.message, attempt });
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (isTimeout) throw timeoutError(`${label} 请求超时(${timeoutMs}ms)`);
      throw upstreamError(`${label} 请求失败: ${error.message}`);
    }
  }
  throw lastError instanceof AppError ? lastError : upstreamError(`${label} 请求失败`);
}

export async function fetchText(url, options = {}) {
  const response = await request(url, { accept: 'text/html,application/xhtml+xml,application/xml,*/*', ...options });
  return response.text();
}

export async function fetchJson(url, options = {}) {
  const response = await request(url, { accept: 'application/json', ...options });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw upstreamError(`${options.label || 'upstream'} 返回了非 JSON 内容`, { body: text.slice(0, 300) });
  }
}

/** 并发抓取，失败项不阻塞整体(返回 fulfilled 的结果 + 失败清单) */
export async function settleAll(tasks) {
  const results = await Promise.allSettled(tasks);
  const values = [];
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') values.push(result.value);
    else failures.push({ index, message: result.reason?.message || String(result.reason) });
  });
  return { values, failures };
}
