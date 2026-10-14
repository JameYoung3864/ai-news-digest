/**
 * 搜索页：本地聚合池 + GNews(可选) + Hacker News 社区，三路合并。
 * 交互细节：输入防抖 450ms、URL 同步用 replaceState(不污染历史)、
 * 结果原地更新(不整页重渲染，避免输入框失焦)。
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { $, debounce, escapeHtml, fmtNumber, loadJson, saveJson } from '../utils.js';
import { navigate } from '../router.js';
import { bindCardInteractions, newsCard, pager } from '../components/card.js';
import { emptyState, errorState, noticeBar, skeletonGrid, startLoading, stopLoading } from '../ui/feedback.js';

const RECENT_KEY = 'ainews.recentSearches';
const SUGGESTIONS = ['GPT-5', '开源大模型', 'AI Agent', '算力', 'NVIDIA', 'AI 监管', '多模态', '融资'];

const GROUP_LABELS = {
  local: { label: '已聚合新闻', cls: 'badge-brand' },
  gnews: { label: 'GNews 全网', cls: 'badge-external' },
  hackernews: { label: 'Hacker News', cls: 'badge-community' },
};

export default async function searchView(root, ctx) {
  const pageSize = Math.max(4, Number(store.settings.pageSize) || 12);
  const initialQuery = ctx.query.get('q') || '';

  root.innerHTML = `
    <div class="page-head">
      <h1>🔍 搜索 AI 新闻</h1>
      <p>在已聚合的新闻池中检索，同时可选接入 GNews 全网搜索与 Hacker News 社区讨论</p>
    </div>

    <form id="search-form" role="search" style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px;position:relative">
        <input id="q" type="search" name="q" placeholder="输入关键词，例如：AI Agent、算力、OpenAI…"
               autocomplete="off" value="${escapeHtml(initialQuery)}" aria-label="搜索关键词" />
      </div>
      <button class="btn btn-primary" type="submit">搜索</button>
      <button class="btn" type="button" id="clear-search">清空</button>
    </form>

    <div id="search-recent" style="margin-bottom:16px"></div>
    <div id="search-meta"></div>
    <div id="search-results"></div>
  `;

  const input = $('#q');
  const results = $('#search-results');
  const metaHost = $('#search-meta');
  const recentHost = $('#search-recent');

  const state = {
    q: initialQuery,
    page: Number.parseInt(ctx.query.get('page') || '1', 10) || 1,
    items: [],
    lastGroupCounts: null,
  };

  let controller = null;
  let disposed = false;

  renderRecent(recentHost, (value) => {
    input.value = value;
    state.q = value;
    state.page = 1;
    run(true);
  });

  const onInput = debounce(() => {
    const value = input.value.trim();
    if (value === state.q) return;
    state.q = value;
    state.page = 1;
    run(false);
  }, 450);
  input.addEventListener('input', onInput);

  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    onInput.cancel();
    state.q = input.value.trim();
    state.page = 1;
    run(true);
  });

  $('#clear-search').addEventListener('click', () => {
    input.value = '';
    state.q = '';
    state.page = 1;
    run(false);
    input.focus();
  });

  // 分页 / 重试 / 快捷词
  results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'page') {
      state.page = Number(button.dataset.page) || 1;
      run(true);
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
    if (action === 'suggest') {
      input.value = button.dataset.value;
      state.q = button.dataset.value;
      state.page = 1;
      run(true);
    }
    if (action === 'retry') run(true);
    if (action === 'refresh') run(true, true);
  });

  const articles = new Map();
  const unbind = bindCardInteractions(results, { getArticle: (id) => articles.get(id) });

  async function run(userInitiated = false, force = false) {
    controller?.abort();
    controller = new AbortController();

    if (!state.q) {
      metaHost.innerHTML = '';
      results.innerHTML = emptyState({
        emoji: '💡',
        title: '输入关键词开始搜索',
        desc: '试试下面这些热门方向：',
        action: `<div class="chips" style="justify-content:center">${SUGGESTIONS.map(
          (item) =>
            `<button class="chip" data-action="suggest" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`,
        ).join('')}</div>`,
      });
      syncUrl();
      return;
    }

    results.innerHTML = skeletonGrid(Math.min(pageSize, 6));
    metaHost.innerHTML = '';
    startLoading();

    try {
      const data = await api.search(
        {
          q: state.q,
          page: state.page,
          pageSize,
          community: store.settings.hideCommunity ? '0' : '1',
        },
        { signal: controller.signal },
      );
      if (disposed) return;

      articles.clear();
      for (const item of data.items) articles.set(item.id, item);
      state.items = data.items;
      state.lastGroupCounts = data.meta?.groupCounts || null;

      if (userInitiated) pushRecent(state.q);
      renderRecent(recentHost, (value) => {
        input.value = value;
        state.q = value;
        state.page = 1;
        run(true);
      });

      metaHost.innerHTML = buildMeta(data);
      results.innerHTML = data.items.length
        ? `<div class="news-grid">${data.items.map((item) => newsCard(item, { keyword: state.q })).join('')}</div>
           ${pager(data.pagination, { total: data.pagination.total })}`
        : emptyState({
            emoji: '🕳️',
            title: `没有找到与“${state.q}”相关的新闻`,
            desc: '换个更宽泛的关键词试试，或者清空后浏览最新新闻流。',
            action: `<div class="chips" style="justify-content:center">${SUGGESTIONS.slice(0, 5)
              .map((item) => `<button class="chip" data-action="suggest" data-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`)
              .join('')}</div>`,
          });
    } catch (error) {
      if (disposed) return;
      metaHost.innerHTML = '';
      results.innerHTML = errorState(error, { extra: '<button class="btn" data-action="refresh">忽略缓存重新搜索</button>' });
      void force;
    } finally {
      if (!disposed) stopLoading();
      syncUrl();
    }
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (state.q) url.searchParams.set('q', state.q);
    else url.searchParams.delete('q');
    if (state.page > 1) url.searchParams.set('page', String(state.page));
    else url.searchParams.delete('page');
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  await run(false);

  return () => {
    disposed = true;
    controller?.abort();
    onInput.cancel();
    unbind();
  };
}

function buildMeta(data) {
  const groups = data.meta?.groupCounts || {};
  const chips = Object.entries(groups)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const meta = GROUP_LABELS[key] || { label: key, cls: '' };
      return `<span class="badge ${meta.cls}">${escapeHtml(meta.label)} ${fmtNumber(count)}</span>`;
    })
    .join(' ');

  const notices = [];
  if (!data.meta?.externalEnabled) {
    notices.push(
      noticeBar({
        type: 'info',
        title: '提示：',
        text: '未配置 GNEWS_API_KEY，当前仅搜索已聚合的 RSS 新闻池与 Hacker News。配置后可开启全网搜索。',
      }),
    );
  }
  if (data.meta?.failedSources?.length) {
    notices.push(
      noticeBar({
        type: 'info',
        title: '部分来源不可用：',
        text: data.meta.failedSources.map((item) => `${item.source}(${item.message})`).join('；'),
      }),
    );
  }

  return `
    ${notices.join('')}
    <div class="toolbar">
      <span>共 <strong>${fmtNumber(data.pagination.total)}</strong> 条结果</span>
      <span>·</span>
      <span>“${escapeHtml(data.meta?.query || '')}”</span>
      ${chips ? `<span class="spacer"></span>${chips}` : ''}
    </div>`;
}

function renderRecent(host, onPick) {
  const list = loadJson(RECENT_KEY, []);
  if (!list.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="toolbar" style="margin-bottom:0">
      <span>最近搜索：</span>
      <div class="chips">
        ${list
          .map(
            (item) =>
              `<button class="chip" data-recent="${escapeHtml(item)}">${escapeHtml(item)}</button>`,
          )
          .join('')}
        <button class="chip" data-recent-clear="1">清除记录</button>
      </div>
    </div>`;
  host.onclick = (event) => {
    const chip = event.target.closest('[data-recent]');
    if (chip) onPick(chip.dataset.recent);
    if (event.target.closest('[data-recent-clear]')) {
      saveJson(RECENT_KEY, []);
      host.innerHTML = '';
    }
  };
}

function pushRecent(keyword) {
  const list = loadJson(RECENT_KEY, []).filter((item) => item !== keyword);
  saveJson(RECENT_KEY, [keyword, ...list].slice(0, 8));
}
