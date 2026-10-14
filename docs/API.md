# HTTP 接口参考

Base URL：`http://127.0.0.1:3000`

**所有接口都在服务端完成第三方调用，响应中永远不包含 API Key。**

统一约定：

- 请求体：`application/json`，上限 256 KB
- 错误响应：`{ "error": { "code": "机器可读码", "message": "中文说明", "details?": {} } }`
- 限流响应头：`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`

| 业务 code | HTTP | 含义 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 参数缺失或非法 |
| `BAD_JSON` | 400 | 请求体不是合法 JSON |
| `NOT_FOUND` | 404 | 资源/接口不存在 |
| `RATE_LIMITED` | 429 | 触发限流 |
| `NOT_CONFIGURED` | 503 | 缺少必要的 API Key |
| `UPSTREAM_ERROR` | 502 | 上游返回异常 |
| `UPSTREAM_TIMEOUT` | 504 | 上游超时 |
| `AI_BAD_JSON` | 502 | 模型返回内容无法解析为 JSON |
| `INTERNAL_ERROR` | 500 | 未预期错误 |

---

## GET /api/config

前端启动时唯一需要的元信息接口。**严格白名单输出**。

```json
{
  "capabilities": {
    "provider": "rss",
    "availableProviders": ["rss"],
    "ai": { "enabled": true, "mock": false, "model": "deepseek-chat", "reason": "DeepSeek 已配置" },
    "articleExtract": true,
    "envFileLoaded": true
  },
  "categories": [{ "key": "llm", "label": "大模型", "icon": "🧠" }],
  "sources": [{ "id": "qbitai", "name": "量子位", "lang": "zh", "homepage": "..." }],
  "defaults": { "pageSize": 12, "language": "zh", "provider": "rss" },
  "limits": { "maxPageSize": 50, "rateLimit": { "windowMs": 60000, "max": 120 } },
  "version": "1.0.0"
}
```

---

## GET /api/health

```json
{
  "status": "ok",
  "uptimeSeconds": 157,
  "time": "2026-10-14T12:00:00.000Z",
  "node": "v24.16.0",
  "envFileLoaded": true,
  "cache": { "entries": 3, "fresh": 3, "stale": 0 },
  "store": { "cachedArticles": 141 }
}
```

---

## GET /api/news/feed

新闻流(首页)。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `category` | string | `all` | `all`/`llm`/`product`/`agent`/`research`/`business`/`hardware`/`opensource`/`policy`/`safety`；未知值返回空列表 |
| `page` | int | `1` | 超出范围自动夹紧到最后一页 |
| `pageSize` | int | `12` | 上限 50 |
| `q` | string | — | 在当前范围内做关键词过滤 |
| `source` | string | — | 单个来源 id |
| `sources` | string | — | 多个来源 id，逗号分隔(设置页多选筛选) |
| `lang` | string | — | `zh` / `en` |
| `provider` | string | 服务端配置 | `rss` / `gnews` / `newsapi`；不可用时自动回退 |
| `refresh` | `1` | — | 跳过缓存强制重抓 |

```json
{
  "items": [
    {
      "id": "68g_1x4MxHeweu",
      "title": "无问芯穹联合创始人戴国浩博士确认出席 QCon 上海",
      "url": "https://www.infoq.cn/article/...",
      "excerpt": "……",
      "summary": "……",
      "image": "https://...",
      "author": "蔡芳芳",
      "publishedAt": "2026-10-14T10:00:00.000Z",
      "source": { "id": "infoq-cn", "name": "InfoQ 中文", "lang": "zh", "homepage": "..." },
      "host": "infoq.cn",
      "category": "agent",
      "categoryLabel": "智能体",
      "tags": ["agent", "智能体"],
      "readingMinutes": 1,
      "provider": "rss"
    }
  ],
  "pagination": { "page": 1, "pageSize": 12, "total": 141, "totalPages": 12, "hasMore": true, "hasPrev": false },
  "meta": {
    "provider": "rss",
    "providerLabel": "RSS 聚合(免密钥)",
    "upstreamPaged": false,
    "approximateFiltering": false,
    "fallbackFrom": null,
    "stale": false,
    "failedSources": [{ "source": "the-decoder", "message": "rss:the-decoder 请求超时(10000ms)" }],
    "updatedAt": "2026-10-14T12:00:00.000Z",
    "sourceFilter": ["qbitai", "ifanr"],
    "categoryCounts": { "all": 141, "llm": 60, "product": 40, "agent": 14, "...": 0 },
    "categories": [{ "key": "all", "label": "全部", "icon": "🌐" }]
  }
}
```

> `items` **不包含正文**(`content`/`_content`)，正文只在服务端用于 AI 总结。
> `categoryCounts` 已按当前 `source`/`sources`/`q`/`lang` 范围统计，与 Tab 数字一致。

---

## GET /api/news/search

跨源搜索。结果整体缓存 5 分钟，保证翻页时集合稳定。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `q` | string | 必填 | 1–100 字符，空或超长返回 400 |
| `page` / `pageSize` | int | `1` / `12` | 对合并后的结果分页 |
| `category` | string | `all` | 在本地池结果中过滤 |
| `community` | `0` | — | 关闭 Hacker News 一路 |
| `external` | `0` | — | 关闭 GNews 一路 |

```json
{
  "items": [],
  "pagination": { "page": 1, "pageSize": 12, "total": 63, "totalPages": 6 },
  "meta": {
    "query": "Agent",
    "groupCounts": { "local": 34, "hackernews": 29 },
    "failedSources": [],
    "searchedAt": "2026-10-14T12:00:00.000Z",
    "externalEnabled": false
  }
}
```

`items[].provider` 用于前端区分来源：`rss` / `gnews` / `hackernews`。

---

## GET /api/news/article/:id

```json
{
  "article": { "id": "…", "title": "…", "hasFullContent": true, "…": "…" },
  "listItem": { "…": "…" },
  "meta": { "categories": [] }
}
```

id 由文章 URL 的 SHA-1 前 14 位稳定生成，因此刷新、分享后仍可命中。缓存过期或服务重启返回 404：

```json
{ "error": { "code": "NOT_FOUND", "message": "该新闻已不在服务端缓存中(缓存 TTL 到期或服务已重启)，请返回列表重新打开" } }
```

> 前端对此做了兜底：若本地收藏/历史里有同 id 快照，会继续渲染并提示「离线快照」。

---

## GET /api/news/sources · GET /api/news/categories

返回 `{ "sources": [...] }` / `{ "categories": [...] }`。

---

## POST /api/ai/summarize

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `articleId` | string | 二选一 | 服务端缓存中的文章 id |
| `article` | object | 二选一 | 客户端快照(至少含 `title` 与 `url`)，用于服务端缓存过期时的兜底 |
| `language` | `zh`\|`en` | 否 | 默认 `zh` |
| `force` | bool | 否 | 忽略缓存重新生成 |

```json
{
  "summary": "Anthropic 用 7 个人、5 个月重写了版本控制系统……",
  "bullets": ["仅 7 人团队", "5 个月完成", "目标是替代 Git 在 AI 场景下的瓶颈"],
  "keywords": ["Anthropic", "Git", "版本控制", "LLM"],
  "category": "llm",
  "sentiment": "neutral",
  "entities": [{ "name": "Anthropic", "type": "org" }],
  "followUps": ["这对国内大模型厂商意味着什么？"],
  "language": "zh",
  "articleId": "-wWem4W5IvQKZp",
  "title": "Claude 写代码太快，Git 扛不住了……",
  "url": "https://...",
  "ai": {
    "model": "deepseek-chat",
    "mock": false,
    "degraded": false,
    "cached": false,
    "inputOrigin": "extracted",
    "inputChars": 6001,
    "latencyMs": 4820,
    "usage": { "prompt_tokens": 1832, "completion_tokens": 388, "total_tokens": 2220 },
    "generatedAt": "2026-10-14T12:00:00.000Z"
  }
}
```

`ai.inputOrigin` 取值：`extracted`(网页正文) / `feed-content`(RSS 全文) / `feed-summary`(仅摘要) —— 用来判断这次总结的输入质量。

未配置密钥且未开 `AI_MOCK` 时，**不返回错误**，而是返回 `mock` 占位摘要并置 `ai.degraded=true`，让界面保持可用。

---

## POST /api/ai/ask

| 字段 | 说明 |
| --- | --- |
| `articleId` / `article` | 同 summarize |
| `question` | 最长 500 字符 |

```json
{ "answer": "原文提到该团队主要由基础设施工程师组成……", "model": "deepseek-chat", "mock": false, "articleId": "…" }
```

---

## GET /api/ai/status · POST /api/ai/cache/clear

`status` 返回 `{ enabled, mock, model, configured, cache, rateLimit }`。

`cache/clear` 仅在非生产环境可用，返回 `{ cleared: N, cache: {...} }`；生产环境返回 400。
