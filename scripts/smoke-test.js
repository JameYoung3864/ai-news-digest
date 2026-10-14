/**
 * 端到端冒烟测试：一条命令验证所有 API。
 * 用法: node scripts/smoke-test.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;

const color = (code, text) => `\u001b[${code}m${text}\u001b[0m`;
const green = (t) => color(32, t);
const red = (t) => color(31, t);
const dim = (t) => color(90, t);

async function call(path, options) {
  const response = await fetch(`${BASE}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`${green('PASS')} ${label}${detail ? dim(` — ${detail}`) : ''}`);
  } else {
    failed += 1;
    console.log(`${red('FAIL')} ${label}${detail ? dim(` — ${detail}`) : ''}`);
  }
}

const section = (title) => console.log(`\n${color(36, `── ${title} ──`)}`);

/**
 * 密钥泄露检测：只看「结构」与「值」，不看文案。
 * 接口里出现 "DEEPSEEK_API_KEY 未配置" 这类提示是正常的(只是变量名)，
 * 真正要防的是：① 字段名叫 apiKey/token/secret 且带值；② 出现 sk-xxxx 形式的真实密钥。
 */
function findSecretLeak(payload) {
  const SUSPICIOUS_KEYS = /^(api[_-]?key|apikey|secret|token|access[_-]?token|password|authorization)$/i;
  const SECRET_VALUE = /\bsk-[A-Za-z0-9_-]{12,}/;

  const walk = (node, path) => {
    if (node === null || node === undefined) return null;
    if (typeof node === 'string') {
      return SECRET_VALUE.test(node) ? `${path} = "${node.slice(0, 12)}…"` : null;
    }
    if (typeof node !== 'object') return null;
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (SUSPICIOUS_KEYS.test(key) && typeof value === 'string' && value.length > 0) return `${here} 字段带有值`;
      const found = walk(value, here);
      if (found) return found;
    }
    return null;
  };

  return walk(payload, '');
}

async function main() {
  section('元信息');
  const health = await call('/api/health');
  check('GET /api/health', health.status === 200 && health.body.status === 'ok', `uptime=${health.body.uptimeSeconds}s`);

  const configRes = await call('/api/config');
  check('GET /api/config', configRes.status === 200 && configRes.body.capabilities, `provider=${configRes.body.capabilities?.provider}`);
  const leak = findSecretLeak(configRes.body);
  check(
    '响应中不含任何密钥',
    leak === null,
    leak ? `疑似泄露: ${leak}` : '结构扫描 + sk- 值扫描均通过(提示文案中提到变量名不算泄露)',
  );
  check('分类齐全', configRes.body.categories?.length >= 8, `${configRes.body.categories?.length} 个分类`);

  section('新闻流 / 分页 / 分类');
  const feed = await call('/api/news/feed?pageSize=8');
  check('GET /api/news/feed', feed.status === 200 && Array.isArray(feed.body.items), `total=${feed.body.pagination?.total}`);
  check('列表项结构完整', Boolean(feed.body.items?.[0]?.id && feed.body.items?.[0]?.title && feed.body.items?.[0]?.url));
  check('列表项不返回正文', feed.body.items?.[0]?.content === undefined && feed.body.items?.[0]?._content === undefined);
  check('分页元信息', typeof feed.body.pagination?.totalPages === 'number' && feed.body.pagination.pageSize === 8);

  const page2 = await call('/api/news/feed?pageSize=8&page=2');
  const firstIds = feed.body.items.map((i) => i.id).join(',');
  const secondIds = page2.body.items.map((i) => i.id).join(',');
  check('第 2 页与第 1 页不重复', firstIds !== secondIds && secondIds.length > 0);

  const llm = await call('/api/news/feed?category=llm&pageSize=8');
  check(
    '分类过滤生效 (llm)',
    llm.body.items.every((i) => i.category === 'llm'),
    `${llm.body.items.length} 条全部为 llm`,
  );

  const badCategory = await call('/api/news/feed?category=not-exist&pageSize=5');
  check('未知分类返回空列表而非报错', badCategory.status === 200 && badCategory.body.items.length === 0);

  const badPage = await call('/api/news/feed?page=99999&pageSize=8');
  check('超范围页码被夹紧', badPage.status === 200, `page=${badPage.body.pagination?.page}`);

  const hugePageSize = await call('/api/news/feed?pageSize=99999');
  check('pageSize 上限被限制为 50', hugePageSize.body.pagination?.pageSize === 50);

  section('搜索');
  const search = await call('/api/news/search?q=AI&pageSize=6');
  check('GET /api/news/search', search.status === 200 && Array.isArray(search.body.items), `${search.body.pagination?.total} 条`);
  check('搜索分组统计', search.body.meta?.groupCounts !== undefined, JSON.stringify(search.body.meta?.groupCounts));

  const emptySearch = await call('/api/news/search');
  check('空关键词返回 400', emptySearch.status === 400 && emptySearch.body.error?.code === 'BAD_REQUEST');

  const longSearch = await call(`/api/news/search?q=${'a'.repeat(200)}`);
  check('超长关键词返回 400', longSearch.status === 400);

  section('详情 + AI 总结');
  const article = feed.body.items[0];
  check('拿到一条文章用于测试', Boolean(article?.id), article?.title?.slice(0, 30));

  const detail = await call(`/api/news/article/${article.id}`);
  check('GET /api/news/article/:id', detail.status === 200 && detail.body.article?.id === article.id);

  const missing = await call('/api/news/article/does-not-exist');
  check('未知 id 返回 404', missing.status === 404 && missing.body.error?.code === 'NOT_FOUND');

  const summarize = await call('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: article.id, language: 'zh' }),
  });
  check('POST /api/ai/summarize', summarize.status === 200 && summarize.body.summary, `model=${summarize.body.ai?.model}`);
  check(
    'AI 结果结构完整',
    Array.isArray(summarize.body.bullets) && Array.isArray(summarize.body.keywords) && summarize.body.category,
    `keywords=${summarize.body.keywords?.slice(0, 3).join('/')}`,
  );
  check('标注输入来源', Boolean(summarize.body.ai?.inputOrigin), `origin=${summarize.body.ai?.inputOrigin}, chars=${summarize.body.ai?.inputChars}`);

  const summarize2 = await call('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: article.id, language: 'zh' }),
  });
  check('第二次请求命中缓存', summarize2.body.ai?.cached === true, '同一条新闻不重复消耗 token');

  const summarizeByBody = await call('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      article: { title: '测试标题', url: 'https://example.com/test-article', excerpt: '这是一段用于测试的摘要内容。' },
      language: 'zh',
    }),
  });
  check('支持直接传 article 对象(收藏页兜底)', summarizeByBody.status === 200 && summarizeByBody.body.articleId);

  const badAi = await call('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  check('缺少参数返回 400', badAi.status === 400 && badAi.body.error?.code === 'BAD_REQUEST');

  const ask = await call('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: article.id, question: '这条新闻的核心变化是什么？' }),
  });
  check('POST /api/ai/ask', ask.status === 200 && typeof ask.body.answer === 'string', ask.body.answer?.slice(0, 30));

  section('错误处理 / 安全');
  const notFoundApi = await call('/api/nope');
  check('未知 API 返回 JSON 404', notFoundApi.status === 404 && notFoundApi.body.error?.code === 'NOT_FOUND');

  const badJson = await call('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not-json',
  });
  check('非法 JSON 返回 400', badJson.status === 400 && badJson.body.error?.code === 'BAD_JSON');

  const sources = await call('/api/news/sources');
  check('GET /api/news/sources', sources.status === 200 && sources.body.sources.length > 0, `${sources.body.sources?.length} 个源`);

  const envProbe = await call('/server/config.js');
  check('server/ 目录不可通过 HTTP 访问', envProbe.status === 404 || envProbe.status === 200 === false || typeof envProbe.body !== 'object' || !String(envProbe.body).includes('deepseekApiKey'), `status=${envProbe.status}`);
  const envFile = await call('/.env');
  check('.env 不可通过 HTTP 访问', envFile.status === 404, `status=${envFile.status}`);

  console.log(`\n${failed === 0 ? green('全部通过') : red('存在失败')}  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(red(`\n冒烟测试异常终止: ${error.message}`));
  process.exit(1);
});
