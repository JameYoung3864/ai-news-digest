/**
 * 应用入口：启动引导 + 路由分发。
 *
 * 引导阶段只做一件事：GET /api/config 拿到服务端能力与分类/来源清单。
 * 即使这一步失败也照常渲染界面(展示错误提示)，保证不会白屏。
 */
import { api } from './api.js';
import { store } from './store.js';
import { initRouter, matchRoute, navigate, currentLocation, setRenderer } from './router.js';
import { renderFooter, renderHeader, updateHeaderState } from './components/header.js';
import { errorState, startLoading, stopLoading, toast } from './ui/feedback.js';
import { $ } from './utils.js';

import homeView from './views/home.js';
import searchView from './views/search.js';
import detailView from './views/detail.js';
import favoritesView from './views/favorites.js';
import settingsView from './views/settings.js';

const routes = [
  { pattern: /^\/$/, view: homeView },
  { pattern: /^\/search$/, view: searchView },
  { pattern: /^\/news\/([^/]+)$/, view: detailView, keys: ['id'] },
  { pattern: /^\/favorites$/, view: favoritesView },
  { pattern: /^\/settings$/, view: settingsView },
];

let cleanup = null;
let rendering = false;

async function render({ scroll = true } = {}) {
  if (rendering) return;
  rendering = true;
  const root = $('#view');
  const { pathname, query, href } = currentLocation();
  const matched = matchRoute(routes, pathname);

  // 卸载上一个视图，取消它的请求与监听
  try {
    cleanup?.();
  } catch (error) {
    console.warn('视图清理失败', error);
  }
  cleanup = null;

  document.title = titleFor(pathname);
  updateHeaderState();

  if (!matched) {
    root.innerHTML = `
      <div class="page-head"><h1>404 · 页面不存在</h1></div>
      ${errorState({ code: 'ROUTE_NOT_FOUND', message: `没有找到 ${pathname} 对应的页面` }, { retryLabel: '回到首页' })}
    `;
    root.querySelector('[data-action="retry"]')?.addEventListener('click', () => navigate('/'));
    rendering = false;
    return;
  }

  try {
    cleanup = (await matched.route.view(root, { params: matched.params, query, pathname, href })) || null;
  } catch (error) {
    console.error('视图渲染失败', error);
    root.innerHTML = errorState(error, { retryLabel: '重新加载' });
    root.querySelector('[data-action="retry"]')?.addEventListener('click', () => render());
  } finally {
    rendering = false;
    if (scroll) window.scrollTo({ top: 0 });
  }
}

function titleFor(pathname) {
  const base = 'AI News Digest';
  if (pathname.startsWith('/news/')) return `新闻详情 · ${base}`;
  if (pathname === '/search') return `搜索 · ${base}`;
  if (pathname === '/favorites') return `收藏 · ${base}`;
  if (pathname === '/settings') return `设置 · ${base}`;
  return `${base} · AI 新闻聚合与智能总结`;
}

async function bootstrap() {
  store.applyTheme();
  renderHeader();
  renderFooter();
  initRouter();
  setRenderer(render);

  // 首次进入若带了查询串但无路径，规范化为 /
  if (window.location.pathname !== '/' && !matchRoute(routes, currentLocation().pathname)) {
    window.history.replaceState({}, '', '/');
  }

  startLoading();
  try {
    const config = await api.getConfig();
    store.setBootstrap(config);
  } catch (error) {
    console.error('引导失败', error);
    toast(`无法连接后端服务：${error.message}`, 'error', 6000);
  } finally {
    stopLoading();
  }

  await render();

  // 系统主题变化时同步
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (store.settings.theme === 'system') store.applyTheme();
  });

  // 监听设置变化后刷新头部状态
  store.addEventListener('settings:changed', updateHeaderState);

  // 在线状态提示
  window.addEventListener('offline', () => toast('网络已断开，部分功能不可用', 'error', 4000));
  window.addEventListener('online', () => toast('网络已恢复', 'success', 2500));
}

bootstrap();

// 暴露给控制台调试(只读信息，不含任何密钥)
window.__AINEWS__ = { store, api, render };
