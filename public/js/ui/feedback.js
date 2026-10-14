/** 反馈层：顶部进度条、Toast、骨架屏、空状态、错误块。 */
import { $, escapeHtml } from '../utils.js';

/* ---------- 顶部进度条 ---------- */
let progressTimer = null;
let progressValue = 0;

export function startLoading() {
  const bar = $('#progress');
  if (!bar) return;
  clearInterval(progressTimer);
  progressValue = 12;
  bar.classList.add('is-active');
  bar.style.width = `${progressValue}%`;
  progressTimer = setInterval(() => {
    progressValue = Math.min(progressValue + Math.random() * 12, 88);
    bar.style.width = `${progressValue}%`;
  }, 320);
}

export function stopLoading() {
  const bar = $('#progress');
  if (!bar) return;
  clearInterval(progressTimer);
  progressValue = 100;
  bar.style.width = '100%';
  setTimeout(() => {
    bar.classList.remove('is-active');
    bar.style.width = '0';
  }, 320);
}

/* ---------- Toast ---------- */
const ICONS = { success: '✅', error: '⚠️', info: '💡' };

export function toast(message, type = 'info', duration = 3600) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  el.innerHTML = `<span class="icon">${ICONS[type] || ICONS.info}</span><span>${escapeHtml(message)}</span>`;
  el.addEventListener('click', () => el.remove());
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
  // 最多同时显示 4 条
  while (host.children.length > 4) host.firstElementChild.remove();
}

/* ---------- 骨架屏 ---------- */
export function skeletonGrid(count = 6) {
  return `<div class="news-grid">${Array.from({ length: count })
    .map(
      () => `
      <article class="skeleton sk-card" aria-hidden="true"></article>`,
    )
    .join('')}</div>`;
}

export function skeletonDetail() {
  return `
    <div class="detail">
      <div>
        <div class="skeleton sk-line" style="height:34px;width:80%"></div>
        <div class="skeleton sk-line" style="height:34px;width:55%;margin-bottom:24px"></div>
        ${Array.from({ length: 6 })
          .map(() => '<div class="skeleton sk-line" style="height:15px"></div>')
          .join('')}
      </div>
      <div class="skeleton" style="height:320px"></div>
    </div>`;
}

export function skeletonList(count = 4) {
  return `<div class="list">${Array.from({ length: count })
    .map(
      () => `
      <div class="list-item">
        <div class="skeleton thumb" style="border-radius:10px"></div>
        <div class="content">
          <div class="skeleton sk-line" style="height:18px;width:70%"></div>
          <div class="skeleton sk-line" style="width:40%"></div>
        </div>
      </div>`,
    )
    .join('')}</div>`;
}

/* ---------- 空状态 / 错误 ---------- */
export function emptyState({ emoji = '🔍', title = '没有内容', desc = '', action = '' } = {}) {
  return `
    <div class="empty">
      <div class="emoji">${emoji}</div>
      <h3>${escapeHtml(title)}</h3>
      ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
      ${action}
    </div>`;
}

export function errorState(error, { retryLabel = '重试', extra = '' } = {}) {
  const code = escapeHtml(error?.code || 'UNKNOWN');
  const message = escapeHtml(error?.message || '发生未知错误');
  return `
    <div class="error-box">
      <h3><span>⚠️</span> 出错了</h3>
      <p>${message}<br /><code>${code}</code></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="retry">🔄 ${escapeHtml(retryLabel)}</button>
        ${extra}
      </div>
    </div>`;
}

/** 统一的「降级 / 部分失败」提示条 */
export function noticeBar({ type = 'warning', title = '', text = '' }) {
  const icon = type === 'info' ? 'ℹ️' : '⚠️';
  return `
    <div class="notice ${type === 'info' ? 'notice-info' : ''}">
      <span>${icon}</span>
      <div>${title ? `<strong>${escapeHtml(title)}</strong> ` : ''}${escapeHtml(text)}</div>
    </div>`;
}
