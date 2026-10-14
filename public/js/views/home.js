/** 首页新闻流：分类 Tab + 分页 + 收藏 + 加载/错误状态。 */
import { api } from '../api.js';
import { store } from '../store.js';
import { $, escapeHtml, fmtNumber } from '../utils.js';
import { navigate } from '../router.js';
import { bindCardInteractions, newsCard, pager } from '../components/card.js';
import { emptyState, errorState, noticeBar, skeletonGrid, startLoading, stopLoading } from '../ui/feedback.js';

export default async function homeView(root, ctx) {
  const settings = store.settings;
  const category = ctx.query.get('category') || settings.defaultCategory || 'all';
  const page = Number.parseInt(ctx.query.get('page') || '1', 10) || 1;
  const source = ctx.query.get('source') || '';
  const q = ctx.query.get('q') || '';
  const refresh = ctx.query.get('refresh') === '1';

  const pageSize = Math.max(4, Number(settings.pageSize) || 12);

  root.innerHTML = `
    <div class="page-head">
      <h1>🧠 AI 最新新闻</h1>
      <p>聚合 ${store.sources.length || 11} 个 AI 媒体与实验室官方源 · 每条新闻都可一键生成 AI 摘要</p>
    </div>
    <div class="tabs" id="home-tabs" role="tablist"></div>
    <div class="toolbar" id="home-toolbar"></div>
    <div id="home-body">${skeletonGrid(Math.min(pageSize, 9))}</div>
  `;

  renderTabs($('#home-tabs'), { category, categories: store.categories, counts: null, query: ctx.query });
  renderToolbar($('#home-toolbar'), { source, pageSize, q });

  const body = $('#home-body');
  const controller = new AbortController();
  let disposed = false;

  startLoading();
  try {
    // 设置页勾选的来源(多选)在没有单源筛选时生效
    const sourcesParam = !source && settings.sourcesFilter?.length ? settings.sourcesFilter.join(',') : '';
    const data = await api.getFeed(
      { category, page, pageSize, source, sources: sourcesParam, q, refresh: refresh ? '1' : '' },
      { signal: controller.signal },
    );
    if (disposed) return noop;

    const { items, pagination, meta } = data;
    const articles = new Map(items.map((item) => [item.id, item]));

    renderTabs($('#home-tabs'), { category, categories: meta.categories || store.categories, counts: meta.categoryCounts, query: ctx.query });

    body.innerHTML = `
      ${buildNotices(meta)}
      ${
        items.length
          ? `<div class="news-grid" id="home-grid">${items.map((item) => newsCard(item)).join('')}</div>
             ${pager(pagination)}`
          : emptyState({
              emoji: '🗂️',
              title: '该分类暂时没有新闻',
              desc: '换个分类看看，或者稍后点击刷新重新抓取最新内容。',
              action: '<button class="btn btn-primary" data-action="reset-category">查看全部新闻</button>',
            })
      }
    `;

    const unbindCards = bindCardInteractions(body, { getArticle: (id) => articles.get(id) });

    const clickHandler = (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;

      if (action === 'page') {
        const target = Number(button.dataset.page);
        if (!Number.isFinite(target)) return;
        const query = new URLSearchParams(ctx.query);
        query.set('page', String(target));
        navigate(`/?${query.toString()}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (action === 'refresh') {
        const query = new URLSearchParams(ctx.query);
        query.set('page', '1');
        query.set('refresh', '1');
        navigate(`/?${query.toString()}`);
      }
      if (action === 'reset-category') navigate('/');
    };

    body.addEventListener('click', clickHandler);
    return () => {
      disposed = true;
      controller.abort();
      unbindCards();
      body.removeEventListener('click', clickHandler);
    };
  } catch (error) {
    if (disposed) return noop;
    body.innerHTML = errorState(error, {
      extra: '<button class="btn" data-action="refresh">强制重新抓取</button>',
    });
    const retry = (event) => {
      if (event.target.closest('[data-action="retry"]')) {
        navigate(`/?${ctx.query.toString()}`);
      }
      if (event.target.closest('[data-action="refresh"]')) {
        const query = new URLSearchParams(ctx.query);
        query.set('refresh', '1');
        navigate(`/?${query.toString()}`);
      }
    };
    body.addEventListener('click', retry);
    return () => {
      disposed = true;
      controller.abort();
      body.removeEventListener('click', retry);
    };
  } finally {
    if (!disposed) stopLoading();
  }
}

const noop = () => {};

function renderTabs(host, { category, categories, counts, query }) {
  if (!host) return;
  const list = categories?.length ? categories : [{ key: 'all', label: '全部', icon: '🌐' }];
  host.innerHTML = list
    .map((item) => {
      const count = counts?.[item.key];
      const next = new URLSearchParams(query);
      if (item.key === 'all') next.delete('category');
      else next.set('category', item.key);
      next.delete('page');
      return `
        <button class="tab ${item.key === category ? 'is-active' : ''}" role="tab"
                aria-selected="${item.key === category}" data-category="${escapeHtml(item.key)}"
                data-href="/?${next.toString()}">
          <span>${item.icon || '📰'}</span><span>${escapeHtml(item.label)}</span>
          ${count !== undefined && count !== null ? `<span class="tab-count">${fmtNumber(count)}</span>` : ''}
        </button>`;
    })
    .join('');

  host.onclick = (event) => {
    const tab = event.target.closest('[data-category]');
    if (tab) navigate(tab.dataset.href);
  };
}

function renderToolbar(host, { source, pageSize, q }) {
  if (!host) return;
  const sources = (store.sources || []).filter(
    (item) => !store.settings.sourcesFilter?.length || store.settings.sourcesFilter.includes(item.id),
  );
  host.innerHTML = `
    <label style="display:flex;align-items:center;gap:7px">
      <span>来源</span>
      <select id="source-select" style="width:auto;min-width:150px;padding:6px 30px 6px 10px;font-size:13px">
        <option value="">全部来源</option>
        ${sources
          .map(
            (item) =>
              `<option value="${escapeHtml(item.id)}" ${item.id === source ? 'selected' : ''}>${escapeHtml(item.name)}${item.lang === 'zh' ? ' · 中文' : ''}</option>`,
          )
          .join('')}
      </select>
    </label>
    <span>每页 ${pageSize} 条</span>
    ${q ? `<span>· 关键词 “${escapeHtml(q)}”</span>` : ''}
    <span class="spacer"></span>
    <button class="btn btn-sm" data-action="refresh">🔄 强制刷新</button>
  `;

  host.querySelector('#source-select')?.addEventListener('change', (event) => {
    const query = new URLSearchParams(window.location.search);
    const value = event.target.value;
    if (value) query.set('source', value);
    else query.delete('source');
    query.delete('page');
    navigate(`/?${query.toString()}`);
  });
}

/** 顶部提示：降级 / 部分源失败 / 缓存过期 */
function buildNotices(meta = {}) {
  const notices = [];

  if (meta.fallbackFrom) {
    notices.push(
      noticeBar({
        type: 'warning',
        title: '已自动降级：',
        text: `${meta.fallbackFrom.provider} 接口不可用(${meta.fallbackFrom.message})，当前展示的是 RSS 聚合结果。`,
      }),
    );
  }
  if (meta.stale) {
    notices.push(noticeBar({ type: 'info', title: '缓存数据：', text: '上游暂时不可用，正在展示最近一次成功抓取的内容。' }));
  }
  if (meta.failedSources?.length) {
    const names = meta.failedSources.map((item) => item.source).join('、');
    notices.push(
      noticeBar({
        type: 'info',
        title: '部分来源抓取失败：',
        text: `${names}。其余来源已正常展示，可点击「强制刷新」重试。`,
      }),
    );
  }
  return notices.join('');
}
