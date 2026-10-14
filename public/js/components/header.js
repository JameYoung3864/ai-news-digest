/** 站点头部：导航、快捷搜索、主题切换、收藏计数徽标。 */
import { store } from '../store.js';
import { $, debounce, escapeHtml } from '../utils.js';
import { navigate } from '../router.js';
import { currentLocation } from '../router.js';

const NAV = [
  { href: '/', label: '首页', icon: '🏠', match: (p) => p === '/' },
  { href: '/search', label: '搜索', icon: '🔍', match: (p) => p === '/search' },
  { href: '/favorites', label: '收藏', icon: '★', match: (p) => p === '/favorites', badge: 'favorites' },
  { href: '/settings', label: '设置', icon: '⚙️', match: (p) => p === '/settings' },
];

export function renderHeader() {
  const host = $('#site-header');
  if (!host) return;

  host.innerHTML = `
    <div class="header-inner">
      <a class="logo" href="/" data-link>
        <span class="logo-mark">🧠</span>
        <span class="logo-text">AI News Digest</span>
      </a>
      <nav class="nav" id="main-nav">
        ${NAV.map(
          (item) => `
          <a class="nav-link" href="${item.href}" data-link data-nav="${item.href}">
            <span>${item.icon}</span><span>${item.label}</span>
            ${item.badge === 'favorites' ? '<span class="nav-badge" id="nav-fav-count" hidden>0</span>' : ''}
          </a>`,
        ).join('')}
      </nav>
      <span class="header-spacer"></span>
      <form class="header-search" id="header-search" role="search">
        <span class="icon">🔍</span>
        <input type="search" name="q" placeholder="搜索 AI 新闻…  ( / )" autocomplete="off" aria-label="搜索新闻" />
      </form>
      <button class="icon-btn" id="theme-toggle" title="切换主题" aria-label="切换主题">🌗</button>
    </div>
  `;

  const form = $('#header-search');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = new FormData(form).get('q')?.toString().trim();
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`);
  });

  $('#theme-toggle')?.addEventListener('click', () => {
    const resolved = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    store.updateSettings({ theme: resolved });
    toastTheme(resolved);
  });

  // 快捷键：/ 聚焦搜索，Esc 失焦
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (event.key === '/' && !typing) {
      event.preventDefault();
      if (window.innerWidth <= 860) navigate('/search');
      else $('#header-search input')?.focus();
    }
    if (event.key === 'Escape' && tag === 'INPUT' && document.activeElement.id !== 'q') {
      document.activeElement.blur();
    }
  });

  // 收藏数变化时更新徽标
  store.addEventListener('favorites:changed', updateHeaderState);
  updateHeaderState();
}

function toastTheme(theme) {
  import('../ui/feedback.js').then(({ toast }) => toast(theme === 'light' ? '已切换到浅色主题' : '已切换到深色主题', 'info', 1600));
}

export function updateHeaderState() {
  const { pathname } = currentLocation();
  for (const item of NAV) {
    const el = document.querySelector(`[data-nav="${item.href}"]`);
    if (el) el.classList.toggle('is-active', item.match(pathname));
  }
  const badge = $('#nav-fav-count');
  if (badge) {
    const count = store.favorites.length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  const input = $('#header-search input');
  const query = new URLSearchParams(window.location.search).get('q');
  if (input && pathname === '/search' && query && input.value !== query) input.value = query;
}

export function renderFooter() {
  const host = $('#site-footer');
  if (!host) return;
  host.innerHTML = `
    <div>
      AI News Digest · 新闻来源为各站点公开 RSS，版权归原作者所有 ·
      按 <kbd>/</kbd> 快速搜索 · 密钥由后端代理，浏览器不接触任何 API Key
    </div>
  `;
}
