/**
 * 新闻详情页：原文摘要 + DeepSeek 智能总结 + 追问 + 收藏/历史。
 * 兜底策略：服务端缓存过期时用本地收藏/历史里的快照继续渲染，AI 接口同时带上本地快照。
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { $, categoryIcon, escapeHtml, fmtDateTime, fmtRelative, SENTIMENT_LABELS } from '../utils.js';
import { navigate } from '../router.js';
import { errorState, noticeBar, skeletonDetail, startLoading, stopLoading, toast } from '../ui/feedback.js';

export default async function detailView(root, ctx) {
  const id = ctx.params.id;
  const wantSummary = ctx.query.get('summary') === '1';

  const local = findLocal(id);
  root.innerHTML = skeletonDetail();
  startLoading();

  const controller = new AbortController();
  let disposed = false;
  let article = null;
  let offline = false;

  try {
    const data = await api.getArticle(id);
    article = { ...data.article, content: undefined };
  } catch (error) {
    if (disposed) return noop;
    if (local) {
      article = local;
      offline = true;
    } else {
      root.innerHTML = `
        <div class="page-head"><h1>😕 找不到这条新闻</h1></div>
        ${errorState(error, {
          retryLabel: '返回首页',
          extra: '<button class="btn" data-action="goto-search">去搜索</button>',
        })}
      `;
      const handler = (event) => {
        if (event.target.closest('[data-action="retry"]')) navigate('/');
        if (event.target.closest('[data-action="goto-search"]')) navigate('/search');
      };
      root.addEventListener('click', handler);
      stopLoading();
      return () => root.removeEventListener('click', handler);
    }
  }

  if (disposed) return noop;

  // 记录浏览历史
  store.recordView(article);

  const language = store.settings.language || 'zh';
  const cachedSummary = store.getSummary(article.id, language);

  root.innerHTML = `
    <div class="detail">
      <div>
        <article>
          <header class="article-head">
            <div class="article-meta" style="margin-bottom:12px">
              <span class="badge badge-brand">${categoryIcon(article.category)} ${escapeHtml(article.categoryLabel || article.category || '其他')}</span>
              <span>${escapeHtml(article.source?.name || article.host || '未知来源')}</span>
              ${article.author ? `<span>·</span><span>${escapeHtml(article.author)}</span>` : ''}
              <span>·</span>
              <time datetime="${escapeHtml(article.publishedAt)}" title="${escapeHtml(fmtDateTime(article.publishedAt))}">${escapeHtml(fmtRelative(article.publishedAt))}</time>
              ${article.readingMinutes ? `<span>·</span><span>约 ${article.readingMinutes} 分钟</span>` : ''}
            </div>
            <h1>${escapeHtml(article.title)}</h1>
            <div class="article-actions">
              <a class="btn btn-primary" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">阅读原文 ↗</a>
              <button class="btn ${store.isFavorite(article.id) ? 'is-active fav-btn' : ''}" data-action="fav" id="detail-fav">
                ${store.isFavorite(article.id) ? '★ 已收藏' : '☆ 收藏'}
              </button>
              <button class="btn" data-action="copy">🔗 复制链接</button>
              <button class="btn btn-ghost" data-action="back">← 返回</button>
            </div>
          </header>

          ${offline ? noticeBar({ type: 'info', title: '离线快照：', text: '服务端缓存已过期，当前展示的是你本地保存的内容快照。' }) : ''}

          ${article.image ? `<img class="hero-image" src="${escapeHtml(article.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}

          ${article.excerpt || article.summary ? `<p class="article-lead">${escapeHtml(article.excerpt || article.summary)}</p>` : ''}

          <div class="article-body" id="article-body">
            <p style="color:var(--text-faint);font-size:14px">
              本站只做聚合与摘要，不转载全文。完整内容请访问
              <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">原文页面 ↗</a>。
            </p>
          </div>

          ${article.tags?.length ? `<div class="section-title">相关标签</div><div class="chips">${article.tags
            .map((tag) => `<button class="chip" data-action="tag" data-value="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
            .join('')}</div>` : ''}
        </article>
      </div>

      <aside>
        <section class="ai-panel" id="ai-panel">
          <div class="ai-panel-head">
            <span>✨</span><span>AI 智能总结</span>
            <span class="spacer"></span>
            <span class="badge" id="ai-status-badge">DeepSeek</span>
          </div>
          <div class="ai-panel-body" id="ai-body"></div>
        </section>

        <section class="sidebar-card" id="sidebar-info">
          <h3>新闻信息</h3>
          <div class="kv"><span class="k">来源</span><span class="v">${escapeHtml(article.source?.name || '—')}</span></div>
          <div class="kv"><span class="k">站点</span><span class="v">${escapeHtml(article.host || '—')}</span></div>
          <div class="kv"><span class="k">发布时间</span><span class="v">${escapeHtml(fmtDateTime(article.publishedAt))}</span></div>
          <div class="kv"><span class="k">分类</span><span class="v">${escapeHtml(article.categoryLabel || article.category || '—')}</span></div>
          <div class="kv"><span class="k">文章 ID</span><span class="v" style="font-family:var(--mono);font-size:11.5px">${escapeHtml(article.id)}</span></div>
        </section>

        <section class="sidebar-card" id="sidebar-related">
          <h3>同类新闻</h3>
          <div style="color:var(--text-faint);font-size:13px">加载中…</div>
        </section>
      </aside>
    </div>
  `;

  /* ---------- 事件 ---------- */
  const clickHandler = async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'fav') {
      const added = store.toggleFavorite(article);
      button.textContent = added ? '★ 已收藏' : '☆ 收藏';
      button.classList.toggle('fav-btn', added);
      button.classList.toggle('is-active', added);
      toast(added ? '已加入收藏' : '已取消收藏', added ? 'success' : 'info', 2000);
    }

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(article.url);
        toast('链接已复制到剪贴板', 'success', 2000);
      } catch {
        toast('复制失败，请手动复制地址栏链接', 'error');
      }
    }

    if (action === 'back') {
      if (history.length > 1) history.back();
      else navigate('/');
    }

    if (action === 'tag') {
      navigate(`/search?q=${encodeURIComponent(button.dataset.value)}`);
    }

    if (action === 'summarize' || action === 'regenerate') {
      generateSummary({ force: action === 'regenerate' });
    }
  };
  root.addEventListener('click', clickHandler);

  /* ---------- AI 面板 ---------- */
  renderAiPlaceholder($('#ai-body'), { cachedSummary, enabled: store.capabilities?.ai?.enabled });

  if (cachedSummary) {
    renderSummary($('#ai-body'), cachedSummary, { fromCache: true });
    mountAsk();
  } else if (wantSummary || store.settings.autoSummarize) {
    // 已配置 AI 时自动生成，未配置时给出明确提示而不是静默失败
    const enabled = store.capabilities?.ai?.enabled;
    if (enabled) generateSummary({ force: false });
    else renderAiDisabled($('#ai-body'));
  }

  /** 追问表单每次重渲染后都要重新绑定(节点被替换) */
  function mountAsk() {
    attachAskForm('#ai-body', { getArticle: () => article, controller });
  }

  async function generateSummary({ force = false } = {}) {
    const body = $('#ai-body');
    const badge = $('#ai-status-badge');
    if (!body) return;

    body.innerHTML = `
      <div class="skeleton sk-line" style="height:15px"></div>
      <div class="skeleton sk-line" style="height:15px"></div>
      <div class="skeleton sk-line" style="height:15px;width:70%"></div>
      <p style="color:var(--text-faint);font-size:12.5px;margin-top:12px">
        正在抓取正文并调用 DeepSeek 生成摘要…（首次约 3-10 秒）
      </p>`;
    badge.textContent = '生成中…';
    startLoading();

    try {
      const payload = await api.summarize(
        { articleId: article.id, article: store.snapshot(article), language, force },
        { signal: controller.signal },
      );
      if (disposed) return;
      store.putSummary(article.id, language, payload);
      renderSummary(body, payload, { fromCache: false });
      mountAsk();
      badge.textContent = payload.ai?.mock ? '演示模式' : payload.ai?.model || 'DeepSeek';
      if (payload.ai?.degraded) {
        body.insertAdjacentHTML(
          'afterbegin',
          noticeBar({ type: 'warning', title: '演示数据：', text: '服务端未配置 DEEPSEEK_API_KEY，以下为占位内容。在 .env 中配置后重启即可获得真实总结。' }),
        );
      }
    } catch (error) {
      if (disposed) return;
      body.innerHTML = errorState(error, {
        retryLabel: '重新生成',
        extra: '<button class="btn" data-action="regenerate">忽略缓存重试</button>',
      });
      badge.textContent = '失败';
    } finally {
      if (!disposed) stopLoading();
    }
  }

  /* ---------- 同类新闻 ---------- */
  loadRelated(article, controller).catch(() => {});

  stopLoading();
  return () => {
    disposed = true;
    controller.abort();
    root.removeEventListener('click', clickHandler);
  };
}

const noop = () => {};

function findLocal(id) {
  return (
    store.favorites.find((item) => item.id === id) ||
    store.history.find((item) => item.id === id) ||
    null
  );
}

function renderAiPlaceholder(body, { cachedSummary, enabled }) {
  if (!body || cachedSummary) return;
  body.innerHTML = `
    <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:14px">
      让 DeepSeek 快速读完这条新闻，给出中文摘要、关键要点与关键词。
    </p>
    <button class="btn btn-primary" data-action="summarize" ${enabled ? '' : 'disabled'}>
      ✨ 生成 AI 总结
    </button>
    ${enabled ? '' : '<div class="hint" style="margin-top:10px;color:var(--text-faint);font-size:12.5px">服务端未配置 DEEPSEEK_API_KEY</div>'}
  `;
}

function renderAiDisabled(body) {
  body.innerHTML =
    noticeBar({ type: 'warning', title: 'AI 未启用：', text: '服务端未配置 DEEPSEEK_API_KEY。请在项目根目录的 .env 中填入密钥并重启服务。' }) +
    `<button class="btn" data-action="summarize">重试</button>`;
}

/** 渲染结构化总结结果 */
function renderSummary(body, payload, { fromCache }) {
  const sentiment = SENTIMENT_LABELS[payload.sentiment] || SENTIMENT_LABELS.neutral;
  body.innerHTML = `
    ${fromCache ? '<div class="badge" style="margin-bottom:12px">来自本地缓存</div>' : ''}
    <div class="ai-block-label">摘要</div>
    <p class="ai-summary-text">${escapeHtml(payload.summary)}</p>

    ${
      payload.bullets?.length
        ? `<div class="ai-block-label">关键要点</div>
           <ul class="bullets">${payload.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : ''
    }

    ${
      payload.keywords?.length
        ? `<div class="ai-block-label">关键词</div>
           <div class="chips">${payload.keywords
             .map((word) => `<button class="chip" data-action="tag" data-value="${escapeHtml(word)}">${escapeHtml(word)}</button>`)
             .join('')}</div>`
        : ''
    }

    ${
      payload.entities?.length
        ? `<div class="ai-block-label">实体</div>
           <div class="chips">${payload.entities
             .map((entity) => `<span class="chip">${escapeHtml(entity.name)} <span style="opacity:.6">${escapeHtml(entity.type)}</span></span>`)
             .join('')}</div>`
        : ''
    }

    <div class="ai-block-label">倾向</div>
    <div class="chips"><span class="chip">${sentiment.icon} ${sentiment.text}</span></div>

    ${
      payload.followUps?.length
        ? `<div class="ai-block-label">可以继续问</div>
           <div class="chips">${payload.followUps
             .map((q) => `<button class="chip" data-ask="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
             .join('')}</div>`
        : ''
    }

    ${askFormHtml()}

    <div class="ai-stats">
      model: ${escapeHtml(payload.ai?.model || payload.model || '—')}${payload.ai?.mock ? ' (mock)' : ''}<br />
      input: ${escapeHtml(payload.ai?.inputOrigin || '—')} · ${payload.ai?.inputChars ?? 0} 字符<br />
      ${payload.ai?.usage ? `tokens: prompt ${payload.ai.usage.prompt_tokens} / completion ${payload.ai.usage.completion_tokens}<br />` : ''}
      ${payload.ai?.latencyMs ? `latency: ${payload.ai.latencyMs} ms<br />` : ''}
      ${fromCache ? 'cached: localStorage' : payload.ai?.cached ? 'cached: server' : 'cached: no'}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-sm" data-action="regenerate">🔄 重新生成</button>
    </div>
  `;
}

function askFormHtml() {
  return `
    <div class="ai-block-label">继续追问</div>
    <form class="qa-form" id="qa-form">
      <input name="question" placeholder="针对这条新闻提问…" autocomplete="off" aria-label="追问内容" />
      <button class="btn btn-primary" type="submit">提问</button>
    </form>
    <div class="qa-answers" id="qa-answers"></div>
  `;
}

/** 追问表单：动态挂载，切换语言/重新生成后依然可用 */
function attachAskForm(rootSelector, { getArticle, controller }) {
  const root = document.querySelector(rootSelector);
  if (!root) return;
  const form = root.querySelector('#qa-form');
  const answers = root.querySelector('#qa-answers');
  const askButtons = root.querySelectorAll('[data-ask]');

  const submit = async (question) => {
    if (!question?.trim() || !answers) return;
    const item = document.createElement('div');
    item.className = 'qa-item';
    item.innerHTML = `<div class="q">Q: ${escapeHtml(question)}</div><div class="a">思考中…</div>`;
    answers.prepend(item);
    try {
      const result = await api.ask(
        { articleId: getArticle().id, article: store.snapshot(getArticle()), question, language: store.settings.language },
        { signal: controller.signal },
      );
      item.querySelector('.a').textContent = result.answer;
    } catch (error) {
      item.querySelector('.a').textContent = `回答失败：${error.message}`;
      item.style.borderColor = 'var(--danger)';
    }
  };

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.elements.question;
    const value = input.value.trim();
    input.value = '';
    submit(value);
  });

  askButtons.forEach((button) => {
    button.addEventListener('click', () => submit(button.dataset.ask));
  });
}

async function loadRelated(article, controller) {
  const host = document.querySelector('#sidebar-related');
  if (!host) return;
  try {
    const data = await api.getFeed(
      { category: article.category && article.category !== 'other' ? article.category : 'all', pageSize: 6 },
      { signal: controller.signal },
    );
    const items = data.items.filter((item) => item.id !== article.id).slice(0, 5);
    host.innerHTML = `
      <h3>同类新闻</h3>
      ${
        items.length
          ? `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:11px">
              ${items
                .map(
                  (item) => `
                <li style="font-size:13.5px;line-height:1.5">
                  <a href="/news/${encodeURIComponent(item.id)}" data-link style="color:var(--text)">${escapeHtml(item.title)}</a>
                  <div style="color:var(--text-faint);font-size:11.5px;margin-top:3px">
                    ${escapeHtml(item.source?.name || '')} · ${escapeHtml(fmtRelative(item.publishedAt))}
                  </div>
                </li>`,
                )
                .join('')}
            </ul>`
          : '<div style="color:var(--text-faint);font-size:13px">暂无同类新闻</div>'
      }`;
  } catch {
    host.innerHTML = '<h3>同类新闻</h3><div style="color:var(--text-faint);font-size:13px">加载失败</div>';
  }
}
