/**
 * 极简 History API 路由。
 * 视图通过 navigate() 改地址并触发重渲染，浏览器前进/后退天然可用。
 */
let renderFn = async () => {};

export function setRenderer(fn) {
  renderFn = fn;
}

export function currentLocation() {
  const { pathname, search } = window.location;
  const query = new URLSearchParams(search);
  return { pathname: pathname.replace(/\/+$/, '') || '/', query, href: `${pathname}${search}` };
}

/** 匹配路由表，返回 { view, params } */
export function matchRoute(routes, pathname) {
  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const params = {};
      (route.keys || []).forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] || '');
      });
      return { route, params };
    }
  }
  return null;
}

export async function navigate(url, { replace = false, scroll = true } = {}) {
  const target = new URL(url, window.location.origin);
  const sameUrl = target.pathname + target.search === window.location.pathname + window.location.search;
  if (!sameUrl) {
    if (replace) window.history.replaceState({}, '', target);
    else window.history.pushState({}, '', target);
  }
  await renderFn({ scroll });
}

/** 只更新 query，不新增历史记录(用于搜索框联想、筛选等高频操作) */
export function replaceQuery(patch, { scroll = false } = {}) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  return navigate(url.pathname + url.search, { replace: true, scroll });
}

export function initRouter() {
  window.addEventListener('popstate', () => {
    renderFn({ scroll: false });
  });

  // 拦截站内链接，避免整页刷新
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-link]');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//')) return;
    event.preventDefault();
    navigate(href);
  });
}
