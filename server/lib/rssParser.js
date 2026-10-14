/**
 * 零依赖 RSS 2.0 / Atom 解析器。
 * 只做新闻聚合需要的字段，避免引入重量级 XML 依赖。
 */
import { cleanText, decodeEntities, stripHtml, truncate } from './textUtils.js';

function unwrapCdata(value = '') {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

function text(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? decodeEntities(unwrapCdata(match[1])).trim() : '';
}

function attr(block, tag, attribute) {
  const re = new RegExp(`<${tag}[^>]*\\s${attribute}\\s*=\\s*"([^"]*)"`, 'i');
  const match = block.match(re);
  if (match) return decodeEntities(match[1]).trim();
  const single = new RegExp(`<${tag}[^>]*\\s${attribute}\\s*=\\s*'([^']*)'`, 'i');
  const match2 = block.match(single);
  return match2 ? decodeEntities(match2[1]).trim() : '';
}

/** Atom 的 link 是自闭合标签，优先取 rel="alternate" 或第一个 href */
function linkOf(block) {
  const inline = text(block, 'link');
  if (inline) return inline;
  const links = block.match(/<link\b[^>]*>/gi) || [];
  let fallback = '';
  for (const tag of links) {
    const href = (tag.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const rel = (tag.match(/rel\s*=\s*["']([^"']*)["']/i) || [])[1] || 'alternate';
    if (!href) continue;
    if (rel === 'alternate') return decodeEntities(href).trim();
    if (!fallback) fallback = decodeEntities(href).trim();
  }
  return fallback;
}

function imageOf(block, html) {
  const candidates = [
    attr(block, 'media:content', 'url'),
    attr(block, 'media:thumbnail', 'url'),
    attr(block, 'enclosure', 'url'),
    attr(block, 'image', 'href'),
  ];
  const direct = candidates.find((url) => url && /^https?:\/\//i.test(url));
  if (direct) return direct;
  const img = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return img && /^https?:\/\//i.test(img[1]) ? decodeEntities(img[1]) : '';
}

function categoriesOf(block) {
  const found = [];
  const re = /<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi;
  let match;
  while ((match = re.exec(block))) {
    const value = decodeEntities(stripHtml(unwrapCdata(match[1]))).trim();
    if (value && !found.includes(value)) found.push(value);
  }
  const termRe = /<category[^>]*\sterm\s*=\s*["']([^"']+)["']/gi;
  while ((match = termRe.exec(block))) {
    const value = decodeEntities(match[1]).trim();
    if (value && !found.includes(value)) found.push(value);
  }
  return found;
}

function parseDate(raw) {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

/**
 * @param {string} xml
 * @param {{feedUrl?:string, feedTitle?:string, defaultSource?:string}} meta
 * @returns {{feed:{title:string, description:string, link:string}, items:Array<object>}}
 */
export function parseFeed(xml, meta = {}) {
  const source = String(xml || '');
  const isAtom = /<entry[\s>]/i.test(source);
  const itemBlocks = isAtom ? blocks(source, 'entry') : blocks(source, 'item');

  const channelMatch = source.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch ? channelMatch[1] : source;
  const feedTitle = text(channel, 'title') || meta.feedTitle || '';
  const feedDescription = text(channel, 'subtitle') || text(channel, 'description') || '';
  const feedLink = isAtom ? linkOf(channel) : text(channel, 'link');

  const items = itemBlocks.map((block) => {
    const rawContent = text(block, 'content:encoded') || text(block, 'content') || text(block, 'description') || text(block, 'summary');
    const description = cleanText(rawContent);
    const url = linkOf(block) || text(block, 'guid');
    const author =
      text(block, 'dc:creator') ||
      text(block, 'author') ||
      text(block, 'name') ||
      '';
    const publishedAt =
      parseDate(text(block, 'pubDate')) ||
      parseDate(text(block, 'published')) ||
      parseDate(text(block, 'updated')) ||
      parseDate(text(block, 'dc:date'));

    return {
      title: cleanText(text(block, 'title')) || '(无标题)',
      url,
      description,
      excerpt: truncate(description, 260),
      content: cleanText(rawContent),
      image: imageOf(block, rawContent),
      author: cleanText(author),
      categories: categoriesOf(block),
      publishedAt,
      feedTitle,
      feedUrl: meta.feedUrl || feedLink || '',
      sourceName: meta.defaultSource || feedTitle || 'RSS',
    };
  });

  return {
    feed: { title: feedTitle, description: cleanText(feedDescription), link: feedLink },
    items: items.filter((item) => item.title && item.url),
  };
}

export default parseFeed;
