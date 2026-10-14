# 🧠 AI News Digest — AI 新闻聚合 + DeepSeek 智能总结

一个开箱即用的全栈站点：聚合全球 AI 新闻 → 列表/搜索/收藏/历史 → 一键用 DeepSeek 生成**中文摘要、关键要点、关键词、实体与追问**。

**所有 API Key 只在后端 `.env` 中使用，浏览器端不持有、不请求、无法读取任何密钥。**

---

## 目录

- [功能一览](#功能一览)
- [技术选型](#技术选型)
- [快速开始(3 步)](#快速开始3-步)
- [API 配置说明](#api-配置说明)
- [目录结构](#目录结构)
- [HTTP 接口](#http-接口)
- [设计要点](#设计要点)
- [常见问题](#常见问题)
- [验证与测试](#验证与测试)

---

## 功能一览

| 需求 | 实现情况 |
| --- | --- |
| 新闻 API | **默认 RSS 聚合(免密钥)**，内置 11 个已验证可直连的源；可选接 GNews / NewsAPI |
| AI 总结 | DeepSeek `chat/completions`，`response_format=json_object` 结构化输出 |
| 密钥安全 | 后端代理全部第三方请求；`/api/config` 白名单输出，无任何密钥字段 |
| 页面 | 首页新闻流、搜索页、新闻详情页、收藏页、设置页(SPA + History 路由) |
| 分类 | 10 个分类(全部/大模型/产品应用/智能体/研究论文/商业融资/算力硬件/开源生态/政策监管/安全对齐)，中英双语关键词自动归类，Tab 带数量角标 |
| 搜索 | 本地聚合池 + Hacker News 社区 + GNews 全网(可选)三路合并，关键词高亮，最近搜索 |
| 分页 | 服务端分页，`pageSize` 可配(8/12/16/24)，上下页 + 首页/末页 |
| 收藏 | 卡片与详情页均可收藏，`localStorage` 持久化，导航栏实时角标 |
| 历史记录 | 进入详情自动记录(最多 120 条)，可单条移除/一键清空 |
| 加载状态 | 顶部进度条 + 卡片/详情/列表三种骨架屏 |
| 错误处理 | 统一 `{error:{code,message}}` 协议；上游失败自动降级并提示；404/400/429/504 分类处理 |
| 额外增强 | AI 追问、同类新闻、来源多选筛选、主题切换、数据导出、服务端 AI 缓存与按 IP 限流 |

---

## 技术选型

- **后端**：Node.js 20.12+ / Express 5 / 原生 `fetch`。**运行时依赖只有 express 一个**，RSS 解析器、缓存、限流、正文抽取全部自研。
- **前端**：原生 ES Modules + History API 路由，**零构建、零框架**。改完源码刷新即可生效。
- **存储**：服务端进程内 TTL 缓存 + 客户端 `localStorage`。无需数据库、无需登录。

> 为什么要自研 RSS 解析而不用 rss-parser？因为新闻聚合只需要 title/link/date/description 四个字段，自研版约 150 行且能针对性处理 Atom 自闭合 `<link>`、`media:content` 配图、`CDATA` 等实际踩过的坑，同时少一个依赖。

---

## 快速开始(3 步)

```bash
# 1. 安装依赖(只有一个 express)
npm install

# 2. 复制环境变量模板
copy .env.example .env      # Windows
cp   .env.example .env      # macOS / Linux

# 3. 启动
npm start
```

打开 <http://127.0.0.1:3000> 即可看到新闻流。

此时 AI 总结面板会提示「未配置 DEEPSEEK_API_KEY」。填上密钥重启即可启用真实总结：

```env
# .env
DEEPSEEK_API_KEY=sk-你的密钥
AI_MOCK=0
```

开发模式(改动自动重启)：`npm run dev`

---

## API 配置说明

### 1. DeepSeek(AI 总结，必需才能用真实摘要)

| 项 | 值 |
| --- | --- |
| 申请地址 | <https://platform.deepseek.com/api_keys> |
| 环境变量 | `DEEPSEEK_API_KEY=sk-xxxx` |
| 接口地址 | `https://api.deepseek.com/chat/completions` |
| 默认模型 | `deepseek-chat`(可改 `DEEPSEEK_MODEL`，如 `deepseek-reasoner`) |
| 计费 | 按 token 计费，新账号通常有赠送额度 |

**省钱设计**：同一条新闻 + 同一语言 + 同一模型只调用一次，结果缓存 24h(`AI_CACHE_TTL_MS`)。服务端再叠一层客户端 `localStorage` 缓存，刷新页面不会重复消耗 token。默认还开启了**正文抽取**——先把网页正文抓下来再喂给模型，比只给标题的总结质量高得多。

### 2. 新闻源

#### 方案 A：RSS 聚合(默认，免密钥，推荐)

`.env` 中 `NEWS_PROVIDER=rss` 即可。已内置且**实测可直连**的 11 个源：

| 源 | 语言 | 类型 |
| --- | --- | --- |
| 量子位 | 中文 | AI 媒体 |
| 爱范儿 | 中文 | 科技媒体(自动过滤 AI 相关) |
| InfoQ 中文 | 中文 | 技术媒体(自动过滤 AI 相关) |
| TechCrunch AI | 英文 | AI 栏目 |
| MIT Technology Review | 英文 | AI 栏目 |
| The Decoder | 英文 | AI 媒体 |
| MarkTechPost | 英文 | AI 媒体 |
| OpenAI News | 英文 | 官方博客 |
| Google DeepMind | 英文 | 官方博客 |
| Microsoft Research | 英文 | 研究博客(自动过滤 AI 相关) |
| arXiv cs.AI | 英文 | 论文 |

> 综合科技源(爱范儿/InfoQ/MSR)会经过 AI 相关性关键词过滤，保证「AI 新闻」纯度。
> 想增删来源：编辑 `server/providers/sources.js` 的 `SOURCES` 数组即可。

#### 方案 B：GNews(可选，支持真正的全网关键词搜索)

| 项 | 值 |
| --- | --- |
| 申请地址 | <https://gnews.io> |
| 免费额度 | 100 次/天 |
| 环境变量 | `GNEWS_API_KEY=xxxx` + `NEWS_PROVIDER=gnews`(或 `auto`) |

配置后**搜索页会自动多出「GNews 全网」一路结果**，无需改代码。

#### 方案 C：NewsAPI(可选)

| 项 | 值 |
| --- | --- |
| 申请地址 | <https://newsapi.org> |
| 免费额度 | 100 次/天，开发者版仅允许 localhost 来源 |
| 环境变量 | `NEWSAPI_API_KEY=xxxx` + `NEWS_PROVIDER=newsapi` |

> ⚠️ 实测在中国大陆网络下 `newsapi.org` 不可达。若请求失败，本站会**自动降级**回 RSS 并在页面顶部提示，不会白屏。

`NEWS_PROVIDER=auto` 的含义：有 GNews key 就用 GNews，否则用 NewsAPI，都没有则回退 RSS。

### 3. 全部环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | 监听地址 |
| `NEWS_PROVIDER` | `rss` | `rss` / `gnews` / `newsapi` / `auto` |
| `GNEWS_API_KEY` | 空 | GNews 密钥 |
| `NEWSAPI_API_KEY` | 空 | NewsAPI 密钥 |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 可指向兼容代理 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |
| `AI_MOCK` | `0` | `1` = 返回演示摘要，不调用 API |
| `REQUEST_TIMEOUT_MS` | `12000` | 单个上游请求超时 |
| `REQUEST_RETRY` | `1` | 重试次数 |
| `FEED_TIMEOUT_MS` | `10000` | 单个 RSS 源超时 |
| `FEED_BUDGET_MS` | `18000` | 整轮聚合硬预算，到点用已抓到的部分返回 |
| `NEWS_CACHE_TTL_MS` | `300000` | 新闻列表缓存 |
| `MAX_ITEMS_PER_SOURCE` | `40` | 单源最多保留条数 |
| `MAX_ARTICLE_AGE_DAYS` | `180` | 超过该天数的新闻不进池 |
| `AI_CACHE_TTL_MS` | `86400000` | AI 总结缓存 |
| `ENABLE_ARTICLE_EXTRACT` | `1` | 是否抓取网页正文提升总结质量 |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `120` | 全局限流 |
| `AI_RATE_LIMIT_MAX` | `15` | AI 接口每窗口限流 |

---

## 目录结构

```
p2_AINews/
├── package.json                 依赖与脚本(运行时依赖仅 express)
├── .env.example                 环境变量模板(含全部配置说明)
├── README.md                    本文档
├── docs/API.md                  HTTP 接口参考
│
├── server/                      ── 后端 ──
│   ├── index.js                 Express 装配、静态托管、SPA 兜底、敏感路径拦截、优雅退出
│   ├── config.js                .env 加载、配置归一化、能力白名单输出
│   ├── lib/
│   │   ├── httpClient.js        带超时/重试/统一 UA 的 fetch 封装 + 并发 settleAll
│   │   ├── rssParser.js         零依赖 RSS 2.0 / Atom 解析器
│   │   ├── contentExtractor.js  网页正文抽取(best-effort，失败回退 RSS 摘要)
│   │   ├── cache.js             TTL 缓存 + single-flight + 上游失败返回过期数据
│   │   ├── textUtils.js         HTML 清洗、实体解码、稳定 ID、阅读时长
│   │   ├── errors.js            统一 AppError(带 HTTP 状态码与业务 code)
│   │   └── logger.js            结构化日志(自动脱敏 api key / token)
│   ├── providers/
│   │   ├── sources.js           新闻源目录 + 10 个分类的关键词规则
│   │   ├── normalize.js         异构上游 → 统一 Article 结构、去重、排序、过滤
│   │   ├── rss.js               RSS 聚合(并发 + 时间预算 + 部分失败不影响整体)
│   │   ├── gnews.js             GNews 适配器
│   │   ├── newsapi.js           NewsAPI 适配器
│   │   ├── hackernews.js        HN 社区搜索适配器
│   │   └── index.js             provider 注册表与降级解析
│   ├── services/
│   │   ├── newsService.js       选源/降级、缓存、分类、搜索、分页、来源筛选
│   │   ├── aiSummary.js         DeepSeek 总结：缓存、正文优选、结构归一化、追问
│   │   ├── deepseek.js          DeepSeek Chat 客户端(JSON 模式 + 容错解析)
│   │   └── articleStore.js      文章内存仓库(详情页按 id 反查)
│   ├── routes/
│   │   ├── news.js              /api/news/*
│   │   ├── ai.js                /api/ai/*
│   │   └── meta.js              /api/config、/api/health
│   └── middleware/
│       ├── errorHandler.js      统一错误响应 + asyncHandler
│       └── rateLimit.js         按 IP + 桶的滑动窗口限流
│
├── public/                      ── 前端(零构建) ──
│   ├── index.html               SPA 外壳 + 防主题闪烁内联脚本
│   ├── css/styles.css           设计系统(变量/主题/布局/组件/响应式)
│   └── js/
│       ├── app.js               启动引导 + 路由分发 + 视图清理
│       ├── router.js            History API 路由 + 站内链接拦截
│       ├── api.js               同源 API 客户端(超时/取消/错误归一化)
│       ├── store.js             设置/收藏/历史/摘要缓存(localStorage + 事件广播)
│       ├── utils.js             DOM、转义、时间格式化、防抖、高亮
│       ├── components/
│       │   ├── header.js        导航、快捷搜索(/)、主题切换、收藏角标
│       │   └── card.js          新闻卡片、列表行、分页器、收藏交互绑定
│       ├── ui/feedback.js       进度条、Toast、骨架屏、空状态、错误块
│       └── views/
│           ├── home.js          首页新闻流
│           ├── search.js        搜索页
│           ├── detail.js        详情页 + AI 面板
│           ├── favorites.js     收藏 / 历史
│           └── settings.js      设置
│
└── scripts/
    ├── smoke-test.js            32 项端到端接口冒烟测试
    └── check-imports.js         前端 ES Module 依赖静态校验
```

---

## HTTP 接口

完整字段说明见 [`docs/API.md`](docs/API.md)。速览：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 服务端能力、分类、来源清单(**密钥白名单**，无任何 key) |
| GET | `/api/health` | 健康检查、缓存与仓库统计 |
| GET | `/api/news/feed` | 新闻流。`category` `page` `pageSize` `q` `source` `sources` `lang` `provider` `refresh` |
| GET | `/api/news/search` | 跨源搜索。`q`(必填) `page` `pageSize` `community=0` `external=0` |
| GET | `/api/news/article/:id` | 新闻详情 |
| GET | `/api/news/sources` | 新闻源清单 |
| POST | `/api/ai/summarize` | 生成总结。`{ articleId \| article, language, force }` |
| POST | `/api/ai/ask` | 针对该新闻追问。`{ articleId \| article, question }` |
| GET | `/api/ai/status` | AI 是否可用、模型、缓存状态 |

示例：

```bash
curl "http://127.0.0.1:3000/api/news/feed?category=llm&pageSize=5"

curl -X POST http://127.0.0.1:3000/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"articleId":"-wWem4W5IvQKZp","language":"zh"}'
```

统一错误格式：

```json
{ "error": { "code": "UPSTREAM_TIMEOUT", "message": "rss:qbitai 请求超时(10000ms)" } }
```

---

## 设计要点

**1. 密钥永不落地前端**
浏览器只请求同源的 `/api/*`。新闻 API 与 DeepSeek 的调用全部发生在服务端；`server/index.js` 显式拦截 `/server`、`/scripts`、`/.env`、`/node_modules` 等敏感路径，避免源码或密钥被静态托管意外暴露。

**2. 三层降级，绝不白屏**
- 某个 RSS 源超时 → 其余源照常展示，顶部提示失败来源
- `NEWS_PROVIDER` 指向的上游整体不可用 → 自动回退 RSS 聚合，并注明降级原因
- 上游全挂但缓存里有旧数据 → 返回过期数据并标注「缓存数据」

**3. 时间预算优于全局超时**
单个源有自己的超时(`FEED_TIMEOUT_MS`)，整轮聚合还有硬预算(`FEED_BUDGET_MS`)。剩余预算不足时直接跳过慢源，保证首屏不因某一个源卡住。

**4. 省 token 的三道防线**
同一新闻同一语言只调一次 DeepSeek → 服务端缓存 24h → 客户端 `localStorage` 缓存。列表页只做分类/搜索，不触发任何 AI 调用。

**5. AI 输出强约束 + 兜底归一化**
提示词要求严格 JSON(`response_format=json_object`)，服务端再对 `summary/bullets/keywords/entities/sentiment` 做一次字段级归一化与越界裁剪，模型偶发跑偏也不会打穿前端。

**6. 前端无构建但工程化完整**
视图层返回 `cleanup` 函数，路由切换时统一取消在途请求、解绑事件，避免内存泄漏与竞态渲染；`navigate()` 统一处理 pushState/滚动；搜索页用 `replaceState` 同步 URL 以免污染历史记录。

---

## 常见问题

**Q：打开详情页没有 AI 摘要？**
服务端未配置 `DEEPSEEK_API_KEY`。在 `.env` 填好后**重启服务**(配置在进程启动时读取)，设置页的「服务端状态」会显示 DeepSeek 已配置。

**Q：新闻每次刷新都一样？**
默认缓存 5 分钟(`NEWS_CACHE_TTL_MS`)。想看最新，点首页右上角「🔄 强制刷新」，或把 TTL 调小。

**Q：某些源一直没有新闻？**
看顶部提示条。部分海外源在特定网络下可能超时，本站会跳过该源并明示，不影响其它来源。

**Q：端口被占用？**
改 `.env` 里的 `PORT`，或 `set PORT=4000 && npm start`(Windows) / `PORT=4000 npm start`(macOS/Linux)。

**Q：搜索结果比预期少？**
未配置 `GNEWS_API_KEY` 时只能检索「已抓取到的新闻池 + Hacker News」，配置 GNews 后即可全网检索。

**Q：收藏会同步到别的浏览器吗？**
不会，收藏与历史只存在当前浏览器 `localStorage`。可在设置页导出 JSON 备份。

---

## 验证与测试

```bash
# 后端 32 项端到端冒烟测试(需服务已启动)
npm run smoke

# 前端 ES Module 依赖静态校验(import 路径与具名导出)
npm run check:imports
```

冒烟测试覆盖：元信息与密钥白名单、分页/分类/边界夹紧、搜索与参数校验、详情 404、AI 总结结构、AI 缓存命中、错误协议、`.env` 与 `server/` 不可通过 HTTP 访问。

浏览器端已用无头 Chrome 逐页渲染验证：首页新闻流、搜索页(63 条结果 / 分组统计 / 关键词高亮)、详情页(AI 面板字段齐全)、收藏页空状态、设置页(健康检查 / 开关 / 来源筛选)。

---

## 许可与免责

新闻内容版权归原作者与来源站点所有，本站仅做聚合索引与摘要呈现，不转载全文。AI 摘要由模型生成，**可能存在偏差或幻觉，请以原文为准**。
