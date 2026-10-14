/** 新闻卡片 / 列表项渲染。所有外部文本都经过 escapeHtml。 */
import { store } from '../store.js';
import { categoryIcon, escapeHtml, fmtRelative, highlight } from '../utils.js';
import { navigate } from '../router.js';
import { toast } from '../ui/feedback.js';

const PROVIDER_BADGES = {
  gnews: { label: 'GNews', cls: 'badge-external' },
  newsapi: { label: 'NewsAPI', cls: 'badge-external' },
  hackernews: { label: 'HN 社区', cls: 'badge-community' },
};

function providerBadge(article) {
  const meta = PROVIDER_BADGES[article.provider];
  if (!meta) return '';
  return `<span class="badge ${meta.cls}">${meta.label}</span>`;
}

function mediaHtml(article) {
  if (store.settings.compactCards) return '';
  const initials = escapeHtml(article.source?.name || article.host || 'AI');
  const image = article.image
    ? `<img src="${escapeHtml(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="this.parentElement.innerHTML='<div class=&quot;fallback&quot;>${initials}</div>'" />`
    : `<div class="fallback">${initials}</div>`;
  return `
    <div class="card-media">
      ${image}
      <span class="badge">${categoryIcon(article.category)} ${escapeHtml(article.categoryLabel || '其他')}</span>
    </div>`;
}

/** 首页 / 搜索页的卡片 */
export function newsCard(article, { keyword = '' } = {}) {
  const favorite = store.isFavorite(article.id);
  return `
    <article class="card" data-id="${escapeHtml(article.id)}">
      ${mediaHtml(article)}
      <div class="card-body">
        <h2 class="card-title">
          <a href="/news/${encodeURIComponent(article.id)}" data-link data-action="open">${highlight(article.title, keyword)}</a>
        </h2>
        ${article.excerpt ? `<p class="card-excerpt">${highlight(article.excerpt, keyword)}</p>` : '<p class="card-excerpt is-muted">该来源未提供摘要 · 打开后可生成 AI 总结</p>'}
        <div class="card-meta">
          <span class="card-source">${escapeHtml(article.source?.name || article.host || '未知来源')}</span>
          <span class="dot"></span>
          <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(fmtRelative(article.publishedAt))}</time>
          ${providerBadge(article)}
        </div>
      </div>
      <div class="card-footer">
        <button class="btn btn-sm fav-btn ${favorite ? 'is-active' : ''}" data-action="fav"
                title="${favorite ? '取消收藏' : '收藏'}" aria-pressed="${favorite}">
          ${favorite ? '★ 已收藏' : '☆ 收藏'}
        </button>
        <button class="btn btn-sm" data-action="quick-summary" title="用 AI 总结这条新闻">✨ AI 总结</button>
        <span class="grow"></span>
        <a class="btn btn-sm btn-ghost" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer"
           title="打开原文">原文 ↗</a>
      </div>
    </article>`;
}

/** 收藏页 / 历史页的紧凑行 */
export function listRow(article, { timestampField = 'addedAt', timestampLabel = '收藏于', actionLabel = '查看' } = {}) {
  const favorite = store.isFavorite(article.id);
  const stamp = article[timestampField];
  return `
    <div class="list-item" data-id="${escapeHtml(article.id)}">
      <div class="thumb">${article.image ? `<img src="${escapeHtml(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('📰'))" />` : '📰'}</div>
      <div class="content">
        <h3><a href="/news/${encodeURIComponent(article.id)}" data-link>${escapeHtml(article.title)}</a></h3>
        <div class="meta">
          <span>${escapeHtml(article.source?.name || '')}</span>
          <span>·</span>
          <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(fmtRelative(article.publishedAt))}</time>
          ${stamp ? `<span>·</span><span>${escapeHtml(timestampLabel)} ${escapeHtml(fmtRelative(stamp))}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-sm fav-btn ${favorite ? 'is-active' : ''}" data-action="fav">${favorite ? '★ 已收藏' : '☆ 收藏'}</button>
        <a class="btn btn-sm" href="/news/${encodeURIComponent(article.id)}" data-link>${escapeHtml(actionLabel)}</a>
        ${actionLabel === '查看' && timestampField === 'viewedAt' ? '<button class="btn btn-sm btn-ghost btn-danger" data-action="remove-history">移除</button>' : ''}
        ${timestampField === 'addedAt' ? '<button class="btn btn-sm btn-ghost btn-danger" data-action="remove-fav">移除</button>' : ''}
      </div>
    </div>`;
}

/** 分页控件 */
export function pager(pagination, { total } = {}) {
  if (!pagination || pagination.totalPages <= 1) return '';
  const { page, totalPages } = pagination;
  const count = total ?? pagination.total;
  return `
    <nav class="pager" aria-label="分页">
      <button class="btn btn-sm" data-action="page" data-page="1" ${page <= 1 ? 'disabled' : ''}>« 首页</button>
      <button class="btn btn-sm" data-action="page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹ 上一页</button>
      <span class="info">第 ${page} / ${totalPages} 页${count ? ` · 共 ${count} 条` : ''}</span>
      <button class="btn btn-sm" data-action="page" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>下一页 ›</button>
      <button class="btn btn-sm" data-action="page" data-page="${totalPages}" ${page >= totalPages ? 'disabled' : ''}>末页 »</button>
    </nav>`;
}

/** 同步单张卡片上的收藏按钮状态 */
function syncFavButton(button, active) {
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
  button.textContent = button.dataset.variant === 'list' ? (active ? '★ 已收藏' : '☆ 收藏') : active ? '★ 已收藏' : '☆ 收藏';
  button.title = active ? '取消收藏' : '收藏';
}

/**
 * 给一个容器统一挂上「收藏 / 快速总结」交互。
 * @param {HTMLElement} root
 * @param {{getArticle:(id:string)=>object|undefined}} options
 * @returns {() => void} 解绑函数
 */
export function bindCardInteractions(root, { getArticle }) {
  const listener = (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;
    if (action !== 'fav' && action !== 'quick-summary') return;

    const host = button.closest('[data-id]');
    const id = host?.dataset.id;
    const article = id ? getArticle(id) : undefined;
    if (!article) return;

    if (action === 'fav') {
      const added = store.toggleFavorite(article);
      syncFavButton(button, added);
      toast(added ? `已收藏：${article.title.slice(0, 24)}…` : '已取消收藏', added ? 'success' : 'info', 2200);
      return;
    }

    if (action === 'quick-summary') {
      // 直接跳到详情页并自动生成总结
      navigate(`/news/${encodeURIComponent(id)}?summary=1`);
    }
  };

  root.addEventListener('click', listener);
  return () => root.removeEventListener('click', listener);
}
