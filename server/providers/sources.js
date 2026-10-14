/**
 * 新闻源目录 + 分类规则。
 *
 * 设计取舍：
 * - 默认走 RSS 聚合，选的全部是「免密钥且验证可直连」的源，开箱即用。
 * - 只有 AI 原生媒体/实验室博客才 trustAI=true；综合科技源必须命中 AI 关键词才收录。
 * - 分类不依赖上游(多数 RSS 没有可靠分类)，而是本地关键词归类，中英双语覆盖。
 */

export const SOURCES = [
  // ---------- 中文 AI / 科技 ----------
  {
    id: 'qbitai',
    name: '量子位',
    url: 'https://www.qbitai.com/feed',
    homepage: 'https://www.qbitai.com',
    lang: 'zh',
    trustAI: true,
  },
  {
    id: 'ifanr',
    name: '爱范儿',
    url: 'https://www.ifanr.com/feed',
    homepage: 'https://www.ifanr.com',
    lang: 'zh',
    trustAI: false,
  },
  {
    id: 'infoq-cn',
    name: 'InfoQ 中文',
    url: 'https://www.infoq.cn/feed',
    homepage: 'https://www.infoq.cn',
    lang: 'zh',
    trustAI: false,
  },
  // ---------- 英文 AI 媒体 ----------
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    homepage: 'https://techcrunch.com',
    lang: 'en',
    trustAI: true,
  },
  {
    id: 'mit-tr-ai',
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    homepage: 'https://www.technologyreview.com',
    lang: 'en',
    trustAI: true,
  },
  {
    id: 'the-decoder',
    name: 'The Decoder',
    url: 'https://the-decoder.com/feed/',
    homepage: 'https://the-decoder.com',
    lang: 'en',
    trustAI: true,
  },
  {
    id: 'marktechpost',
    name: 'MarkTechPost',
    url: 'https://www.marktechpost.com/feed/',
    homepage: 'https://www.marktechpost.com',
    lang: 'en',
    trustAI: true,
  },
  // ---------- 实验室 / 官方博客 ----------
  {
    id: 'openai',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    homepage: 'https://openai.com/news',
    lang: 'en',
    trustAI: true,
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    url: 'https://deepmind.google/blog/rss.xml',
    homepage: 'https://deepmind.google/discover/blog/',
    lang: 'en',
    trustAI: true,
  },
  {
    id: 'msr',
    name: 'Microsoft Research',
    url: 'https://www.microsoft.com/en-us/research/feed/',
    homepage: 'https://www.microsoft.com/en-us/research/blog/',
    lang: 'en',
    trustAI: false,
  },
  // ---------- 学术 ----------
  {
    id: 'arxiv-cs-ai',
    name: 'arXiv cs.AI',
    url: 'http://export.arxiv.org/rss/cs.AI',
    homepage: 'https://arxiv.org/list/cs.AI/recent',
    lang: 'en',
    trustAI: true,
  },
];

export const SOURCE_MAP = new Map(SOURCES.map((source) => [source.id, source]));

/** 分类定义：key 用于 API，label 用于 UI */
export const CATEGORIES = [
  { key: 'all', label: '全部', icon: '🌐' },
  { key: 'llm', label: '大模型', icon: '🧠' },
  { key: 'product', label: '产品应用', icon: '🚀' },
  { key: 'agent', label: '智能体', icon: '🤖' },
  { key: 'research', label: '研究论文', icon: '📄' },
  { key: 'business', label: '商业融资', icon: '💰' },
  { key: 'hardware', label: '算力硬件', icon: '⚡' },
  { key: 'opensource', label: '开源生态', icon: '🧩' },
  { key: 'policy', label: '政策监管', icon: '⚖️' },
  { key: 'safety', label: '安全对齐', icon: '🛡️' },
];

export const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

/** 分类关键词（全部小写匹配） */
const CATEGORY_KEYWORDS = {
  llm: [
    'gpt', 'chatgpt', 'claude', 'gemini', 'llama', 'qwen', '通义', 'deepseek', 'kimi', '文心', 'glm',
    'grok', 'mistral', '大模型', '大語言模型', '基础模型', 'foundation model', 'llm', 'large language model',
    '多模态', 'multimodal', 'o1', 'o3', '推理模型', 'reasoning model', 'token', '预训练', 'pretrain',
    '微调', 'fine-tun', '上下文窗口', 'context window', 'deepseek-v', 'gpt-5', 'gpt-4',
  ],
  agent: [
    'agent', '智能体', 'multi-agent', '多智能体', 'mcp', 'function calling', 'tool use', 'workflow',
    'copilot', 'autogpt', 'manus', 'computer use', '任务规划', 'a2a', 'langgraph', 'autogen',
  ],
  product: [
    'launch', 'releases', 'release', '发布', '上线', '推出', '更新', 'upgrade', 'feature', 'app',
    '应用', '助手', 'assistant', 'chatbot', '搜索', 'search', 'plugin', '插件', 'api', 'sdk',
    '订阅', 'subscription', 'beta', 'preview', '公测', '内测',
  ],
  research: [
    'paper', '论文', 'research', '研究', 'arxiv', 'benchmark', '基准', 'state-of-the-art', 'sota',
    'study', '实验', 'breakthrough', '突破', '算法', 'algorithm', 'nature', 'science', '预印本',
    'neurips', 'icml', 'acl', 'cvpr', 'iclr',
  ],
  business: [
    'funding', 'raise', 'raises', 'valuation', 'ipo', 'acquisition', 'acquire', 'merger', '融资',
    '估值', '收购', '并购', '上市', '投资', 'investor', 'series a', 'series b', 'seed', '营收',
    'revenue', 'layoff', '裁员', '财报', 'earnings', 'partnership', '合作', 'million', 'billion', '亿元', '美元',
  ],
  hardware: [
    'gpu', 'nvidia', 'amd', 'tpu', '芯片', 'chip', 'chiplet', 'h100', 'h200', 'b200', 'gb200',
    '算力', 'compute', '数据中心', 'data center', 'datacenter', '服务器', 'server', 'memory', 'hbm',
    '光刻', 'lithography', 'tsmc', '台积电', 'asic', 'npu', 'edge', '端侧', 'on-device',
  ],
  opensource: [
    'open source', 'open-source', '开源', 'github', 'hugging face', 'huggingface', 'apache',
    'license', '许可', 'weights', '权重', '社区版', 'fork', 'pytorch', 'vllm', 'llama.cpp', 'ollama',
  ],
  policy: [
    'regulation', 'regulate', '监管', 'policy', '政策', 'law', '法案', 'compliance', '合规',
    'lawsuit', '诉讼', 'court', '法院', 'antitrust', '反垄断', 'ban', '禁令', '政府', 'government',
    'eu ai act', '版权', 'copyright', 'privacy', '隐私', 'ftc', 'sec', '国会',
  ],
  safety: [
    'safety', '安全', 'alignment', '对齐', 'jailbreak', '越狱', 'hallucination', '幻觉', 'bias',
    '偏见', 'deepfake', '深度伪造', 'misuse', '滥用', 'red team', '红队', 'risk', '风险', 'guardrail',
    'anthropic', 'interpretability', '可解释',
  ],
};

/** AI 相关性关键词：用于过滤综合科技源 */
const AI_KEYWORDS = [
  'ai', 'a.i.', 'artificial intelligence', '人工智能', 'machine learning', '机器学习', 'deep learning',
  '深度学习', 'neural', '神经网络', 'llm', '大模型', 'chatgpt', 'gpt', 'claude', 'gemini', 'llama',
  'qwen', 'deepseek', 'kimi', 'copilot', 'agent', '智能体', 'openai', 'anthropic', 'deepmind',
  'hugging face', 'transformer', 'diffusion', '扩散模型', 'aigc', '生成式', 'generative', 'gpu',
  'nvidia', '英伟达', '算力', '模型', 'alphago', '自动驾驶', 'autonomous', 'robot', '机器人',
  'npu', 'tpu', 'inference', '推理', '多模态', 'multimodal', 'stable diffusion', 'midjourney',
  'sora', 'gemma', 'mistral', 'grok', '文心', '通义', '豆包', '智谱',
];

const AI_WORD_RE = new RegExp(`(^|[^a-z0-9])(${AI_KEYWORDS.map(escapeRegExp).join('|')})([^a-z0-9]|$)`, 'i');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 判断一条综合源新闻是否属于 AI 话题 */
export function isAiRelated(title = '', summary = '') {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (/[\u4e00-\u9fa5]/.test(haystack)) {
    return AI_KEYWORDS.some((keyword) => haystack.includes(keyword));
  }
  return AI_WORD_RE.test(` ${haystack} `);
}

/** 关键词归类，返回主分类 + 全部命中标签 */
export function classifyArticle(title = '', summary = '') {
  const haystack = `${title} ${summary}`.toLowerCase();
  const hits = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter((keyword) => haystack.includes(keyword));
    if (matched.length) hits.push({ category, score: matched.length, matched });
  }
  if (!hits.length) return { category: 'other', tags: [] };

  // 命中数量多者优先；同分时按定义顺序(stable)取第一个
  hits.sort((a, b) => b.score - a.score);
  return {
    category: hits[0].category,
    tags: [...new Set(hits.flatMap((hit) => hit.matched))].slice(0, 8),
  };
}

export default SOURCES;
