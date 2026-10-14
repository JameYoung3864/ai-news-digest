/**
 * AI 总结服务：把新闻变成「结构化中文摘要」。
 *
 * 关键设计：
 * 1. 缓存优先 —— 同一条新闻同一语言只调用一次 DeepSeek(缓存 24h)，省钱且更快。
 * 2. 正文优先 —— 能用抽取到的正文就不用 RSS 摘要，输入质量决定输出质量。
 * 3. 强约束输出 —— response_format=json_object + 明确 schema，服务端再做一次归一化兜底。
 * 4. AI_MOCK=1 时可离线跑通全链路，便于演示与自动化测试。
 */
import config from '../config.js';
import { cacheClear, cacheStats, cacheWrap } from '../lib/cache.js';
import { extractArticle } from '../lib/contentExtractor.js';
import { badRequest } from '../lib/errors.js';
import logger from '../lib/logger.js';
import { isMostlyChinese, truncate } from '../lib/textUtils.js';
import { chatJson } from './deepseek.js';

const LANGUAGE_LABEL = { zh: '简体中文', en: 'English' };

const SYSTEM_PROMPT = `你是一名资深的 AI 行业分析师，为中文读者撰写每日 AI 简报。
要求：
1. 只依据用户提供的新闻内容作判断，不要编造未出现的事实、数字或引语；不确定就少写。
2. 语言精炼、信息密度高，避免"值得注意的是""总之"这类空话。
3. 必须严格输出 JSON 对象，不要输出任何解释性文字或 Markdown 代码块。`;

function buildSchema(language) {
  const langLabel = LANGUAGE_LABEL[language] || LANGUAGE_LABEL.zh;
  return `请按下面的 JSON schema 输出(所有文本使用${langLabel})：
{
  "summary": "150-260 字的整体总结，讲清这件事是什么、为什么重要",
  "bullets": ["3-5 条关键要点，每条不超过 40 字"],
  "keywords": ["5-8 个关键词或实体名，用于检索与标签"],
  "category": "从 llm/product/agent/research/business/hardware/opensource/policy/safety 中选一个最贴切的",
  "sentiment": "positive | neutral | negative(对 AI 行业发展的整体倾向)",
  "entities": [{ "name": "公司/机构/产品/人名", "type": "org | product | person | tech" }],
  "followUps": ["读者可能想追问的 2-3 个问题"]
}`;
}

function buildUserPrompt(article, text, language) {
  const parts = [
    `【标题】${article.title}`,
    `【来源】${article.source?.name || '未知'}${article.author ? ` / ${article.author}` : ''}`,
    `【发布时间】${article.publishedAt}`,
    article.url ? `【原文链接】${article.url}` : '',
    article.tags?.length ? `【上游标签】${article.tags.join(', ')}` : '',
    '',
    '【正文内容】',
    text || article.summary || article.excerpt || '(正文抓取受限，仅根据标题与摘要总结，可适当保守)',
    '',
    buildSchema(language),
  ];
  return parts.filter(Boolean).join('\n');
}

/** 归一化模型输出：字段缺失/越界时兜底，保证前端永远拿到完整结构 */
function normalizeResult(data, article, language) {
  const asArray = (value) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];

  const bullets = asArray(data.bullets).slice(0, 6);
  const keywords = asArray(data.keywords).slice(0, 10);

  const entities = Array.isArray(data.entities)
    ? data.entities
        .map((entity) => {
          if (typeof entity === 'string') return { name: entity.trim(), type: 'tech' };
          if (entity && typeof entity === 'object' && entity.name) {
            return { name: String(entity.name).trim(), type: String(entity.type || 'tech') };
          }
          return null;
        })
        .filter((entity) => entity?.name)
        .slice(0, 8)
    : [];

  const sentiment = ['positive', 'neutral', 'negative'].includes(data.sentiment) ? data.sentiment : 'neutral';

  return {
    summary: String(data.summary || '').trim() || article.excerpt || article.title,
    bullets,
    keywords: keywords.length ? keywords : article.tags?.slice(0, 6) || [],
    category: String(data.category || article.category || 'other').trim(),
    sentiment,
    entities,
    followUps: asArray(data.followUps).slice(0, 4),
    language,
  };
}

/** 无 Key / AI_MOCK=1 时的确定性演示数据，接口结构完全一致 */
function mockResult(article, language) {
  const excerpt = article.excerpt || article.summary || article.title;
  return {
    summary:
      `【演示模式】${article.title}。该条新闻来自 ${article.source?.name || '未知来源'}，` +
      `发布于 ${new Date(article.publishedAt).toLocaleString('zh-CN')}。` +
      `当前服务端未配置 DEEPSEEK_API_KEY(或 AI_MOCK=1)，因此这里展示的是占位总结；` +
      `配置密钥后即可获得真实的要点提炼、关键词与实体识别结果。原始摘要：${truncate(excerpt, 120)}`,
    bullets: [
      '演示模式：未调用真实 DeepSeek API',
      `来源：${article.source?.name || '未知'}`,
      `分类：${article.categoryLabel || article.category}`,
      '在 .env 中设置 DEEPSEEK_API_KEY 后重启服务即可切换为真实总结',
    ],
    keywords: [...(article.tags || []), article.category, article.source?.name].filter(Boolean).slice(0, 8),
    category: article.category || 'other',
    sentiment: 'neutral',
    entities: [{ name: article.source?.name || '未知来源', type: 'org' }],
    followUps: ['这件事对国内大模型厂商意味着什么？', '相关技术路线还有哪些竞争方案？'],
    language,
  };
}

/**
 * 获取用于总结的最佳文本：优先网页正文抽取，失败回退 RSS 内容。
 */
export async function resolveSourceText(article) {
  if (article._content && article._content.length > 800) {
    return { text: article._content, origin: 'feed-content', chars: article._content.length };
  }
  if (config.enableArticleExtract) {
    const extracted = await extractArticle(article.url);
    if (extracted?.text) {
      article._content = extracted.text;
      return { text: extracted.text, origin: 'extracted', chars: extracted.text.length };
    }
  }
  const fallback = article._content || article.summary || article.excerpt || '';
  return { text: fallback, origin: 'feed-summary', chars: fallback.length };
}

/**
 * @param {{article:object, language?:string, force?:boolean}} params
 */
export async function summarizeArticle({ article, language = 'zh', force = false }) {
  if (!article?.id) throw badRequest('缺少 article.id，无法生成总结');
  const lang = language === 'en' ? 'en' : 'zh';
  const cacheKey = `ai:summary:${article.id}:${lang}:${config.deepseek.model}:${config.aiMock ? 'mock' : 'real'}`;

  if (force) cacheClear(cacheKey);

  const { text, origin, chars } = await resolveSourceText(article);
  const started = Date.now();
  let cacheHit = true;

  const outcome = await cacheWrap(
    cacheKey,
    async () => {
      cacheHit = false;
      if (config.aiMock || !config.deepseek.apiKey) {
        // 无密钥时不要抛错打断前端，返回演示数据并标注原因
        return {
          data: mockResult(article, lang),
          model: 'mock',
          usage: null,
          latencyMs: 0,
          degraded: !config.aiMock,
        };
      }
      const response = await chatJson({
        label: 'deepseek:summarize',
        temperature: 0.3,
        maxTokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(article, text, lang) },
        ],
      });
      return {
        data: normalizeResult(response.data, article, lang),
        model: response.model,
        usage: response.usage,
        latencyMs: response.latencyMs,
        degraded: false,
      };
    },
    { ttlMs: config.cache.aiTtlMs, maxEntries: config.cache.maxEntries },
  );

  // cacheWrap 命中缓存时直接返回已存对象；未命中时返回刚构建的对象
  const payload = outcome?.data
    ? outcome
    : { data: outcome, model: 'cache', usage: null, latencyMs: 0, degraded: false };

  logger.info('summary served', {
    id: article.id,
    cached: cacheHit,
    stale: Boolean(outcome?._stale),
    origin,
    chars,
    ms: Date.now() - started,
  });

  return {
    ...payload.data,
    articleId: article.id,
    title: article.title,
    url: article.url,
    ai: {
      model: payload.model,
      mock: payload.model === 'mock',
      degraded: Boolean(payload.degraded),
      cached: cacheHit,
      inputOrigin: origin,
      inputChars: chars,
      latencyMs: payload.latencyMs,
      usage: payload.usage,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** 详情页「继续追问」：带上文章上下文做单轮问答 */
export async function askAboutArticle({ article, question, language = 'zh' }) {
  if (!question?.trim()) throw badRequest('question 不能为空');
  if (config.aiMock || !config.deepseek.apiKey) {
    return {
      answer:
        `【演示模式】无法回答「${question.trim()}」。请在 .env 中配置 DEEPSEEK_API_KEY 后重启服务，即可基于原文内容进行追问。`,
      model: 'mock',
      mock: true,
    };
  }

  const { text } = await resolveSourceText(article);
  const response = await chatJson({
    label: 'deepseek:ask',
    temperature: 0.4,
    maxTokens: 800,
    messages: [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n本次任务是回答读者对该新闻的追问，请输出 JSON：{"answer":"不超过 200 字的回答"}。若原文信息不足以回答，请直接说明"原文未提及"。`,
      },
      {
        role: 'user',
        content: `新闻标题：${article.title}\n来源：${article.source?.name || '未知'}\n\n正文：\n${text || article.summary}\n\n读者追问：${question.trim()}`,
      },
    ],
  });

  return {
    answer: String(response.data.answer || response.data.result || '').trim() || '模型未返回有效回答。',
    model: response.model,
    mock: false,
    usage: response.usage,
  };
}

export function aiCacheStats() {
  const stats = cacheStats();
  return { ...stats, keys: stats.keys.filter((key) => key.startsWith('ai:')) };
}

export function clearAiCache() {
  return cacheClear('ai:');
}

/** 语言推断：中文源默认中文总结 */
export function inferLanguage(article, requested) {
  if (requested === 'zh' || requested === 'en') return requested;
  return isMostlyChinese(article.title) ? 'zh' : 'zh'; // 面向中文读者，默认中文
}

export default { summarizeArticle, askAboutArticle };
