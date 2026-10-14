/**
 * Best-effort 正文抽取(Readability 的极简替代)。
 * 目标不是 100% 还原网页，而是给 AI 总结提供比 RSS 摘要更长的输入。
 * 任何一步失败都返回 null，由调用方回退到 RSS 摘要。
 */
import { fetchText } from './httpClient.js';
import { cleanText, decodeEntities, hostnameOf, normalizeWhitespace, truncate } from './textUtils.js';
import logger from './logger.js';

const MAX_ARTICLE_CHARS = 6000;

function metaContent(html, names) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]*(?:property|name)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${name}["']`, 'i'),
    ];
    for (const re of patterns) {
      const match = html.match(re);
      if (match?.[1]) return decodeEntities(match[1]).trim();
    }
  }
  return '';
}

function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
}

function pickMainBlock(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1] && article[1].length > 400) return article[1];

  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1] && main[1].length > 400) return main[1];

  // 挑选 <p> 文本量最大的容器
  const containers = html.match(/<(div|section)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
  let best = '';
  let bestScore = 0;
  for (const candidate of containers) {
    const score = (candidate.match(/<p\b/gi) || []).length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (bestScore >= 3 && best.length > 400) return best;
  return html;
}

function extractParagraphs(block) {
  const paragraphs = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = re.exec(block))) {
    const value = normalizeWhitespace(cleanText(match[1]));
    // 过滤导航/版权/短句噪声
    if (value.length < 30) continue;
    if (/^(share|advertisement|subscribe|sign up|cookie|版权所有|点击|扫码|关注我们)/i.test(value)) continue;
    paragraphs.push(value);
  }
  return paragraphs;
}

/**
 * @param {string} url
 * @param {{timeoutMs?:number}} options
 * @returns {Promise<null | {text:string,title:string,siteName:string,image:string,publishedAt:string,author:string,host:string}>}
 */
export async function extractArticle(url, options = {}) {
  try {
    const html = await fetchText(url, {
      label: `article:${hostnameOf(url)}`,
      timeoutMs: options.timeoutMs ?? 9000,
      retry: 0,
    });
    if (!html || html.length < 500) return null;

    const cleaned = stripNoise(html);
    const block = pickMainBlock(cleaned);
    let paragraphs = extractParagraphs(block);

    let text = paragraphs.join('\n\n');
    // 段落抽取失败(很多中文站点用 div)时退化为整块文本
    if (text.length < 400) {
      text = normalizeWhitespace(cleanText(block));
    }
    if (text.length < 200) return null;

    return {
      text: truncate(text, MAX_ARTICLE_CHARS),
      title: metaContent(html, ['og:title', 'twitter:title']) || cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''),
      siteName: metaContent(html, ['og:site_name']) || hostnameOf(url),
      image: metaContent(html, ['og:image', 'twitter:image']),
      publishedAt: metaContent(html, ['article:published_time', 'og:article:published_time', 'datePublished']),
      author: metaContent(html, ['article:author', 'author', 'og:article:author']),
      host: hostnameOf(url),
    };
  } catch (error) {
    logger.warn('article extract failed, fallback to feed summary', { url, message: error.message });
    return null;
  }
}

export default extractArticle;
