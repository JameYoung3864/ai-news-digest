/** 文本处理工具：HTML 清洗、实体解码、稳定 ID、摘要裁剪。 */
import crypto from 'node:crypto';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…',
  mdash: '—', ndash: '–', middot: '·', copy: '©', reg: '®',
  trade: '™', deg: '°', euro: '€', pound: '£', yen: '¥', times: '×',
};

export function decodeEntities(input = '') {
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    const key = body.toLowerCase();
    return key in ENTITIES ? ENTITIES[key] : match;
  });
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function stripHtml(input = '') {
  return decodeEntities(
    String(input)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function normalizeWhitespace(input = '') {
  return String(input).replace(/[ \t\u00a0\u3000]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function cleanText(input = '') {
  return normalizeWhitespace(stripHtml(input));
}

/** 去掉 RSS 里常见的 "标题 - 来源" 尾巴 */
export function stripSourceSuffix(title = '', source = '') {
  const trimmed = String(title).trim();
  if (!source) return trimmed;
  const suffix = ` - ${source}`;
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length).trim() : trimmed;
}

export function truncate(input = '', max = 300) {
  const text = String(input);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** 用 URL 生成稳定短 ID，保证刷新/分享后详情页仍可命中同一条新闻 */
export function stableId(seed) {
  return crypto.createHash('sha1').update(String(seed)).digest('base64url').slice(0, 14);
}

export function estimateReadingMinutes(text = '') {
  const source = String(text);
  const cjk = (source.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (source.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
  const minutes = cjk / 400 + words / 220;
  return Math.max(1, Math.round(minutes));
}

export function isMostlyChinese(text = '') {
  const source = String(text);
  if (!source) return false;
  const cjk = (source.match(/[\u4e00-\u9fa5]/g) || []).length;
  return cjk / source.length > 0.15;
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/** 去掉标题里的 emoji/控制字符，便于关键词匹配 */
export function normalizeForMatch(input = '') {
  return String(input).toLowerCase().replace(/\s+/g, ' ').trim();
}
