/** 收藏页 / 历史记录页。 */
import { store } from '../store.js';
import { $, downloadFile, escapeHtml, fmtNumber } from '../utils.js';
import { navigate } from '../router.js';
import { bindCardInteractions, listRow } from '../components/card.js';
import { emptyState, toast } from '../ui/feedback.js';

export default async function favoritesView(root, ctx) {
  const tab = ctx.query.get('tab') === 'history' ? 'history' : 'favorites';

  function render() {
    const favorites = store.favorites;
    const history = store.history;
    const list = tab === 'favorites' ? favorites : history;

    root.innerHTML = `
      <div class="page-head">
        <h1>${tab === 'favorites' ? '★ 我的收藏' : '🕘 浏览历史'}</h1>
        <p>数据保存在浏览器本地(localStorage)，不会上传到服务器</p>
      </div>

      <div class="tabs">
        <button class="tab ${tab === 'favorites' ? 'is-active' : ''}" data-tab="favorites">
          <span>★</span><span>收藏</span><span class="tab-count">${fmtNumber(favorites.length)}</span>
        </button>
        <button class="tab ${tab === 'history' ? 'is-active' : ''}" data-tab="history">
          <span>🕘</span><span>历史</span><span class="tab-count">${fmtNumber(history.length)}</span>
        </button>
      </div>

      <div class="toolbar">
        <span>共 ${fmtNumber(list.length)} 条</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-action="export" ${list.length ? '' : 'disabled'}>⬇ 导出 JSON</button>
        <button class="btn btn-sm btn-danger" data-action="clear" ${list.length ? '' : 'disabled'}>
          清空${tab === 'favorites' ? '收藏' : '历史'}
        </button>
      </div>

      <div id="fav-body">
        ${
          list.length
            ? `<div class="list">${list
                .map((item) =>
                  listRow(item, tab === 'favorites' ? { timestampField: 'addedAt', timestampLabel: '收藏于' } : { timestampField: 'viewedAt', timestampLabel: '浏览于' }),
                )
                .join('')}</div>`
            : emptyState(
                tab === 'favorites'
                  ? {
                      emoji: '☆',
                      title: '还没有收藏任何新闻',
                      desc: '在首页或详情页点击「☆ 收藏」，之后就能在这里快速回看。',
                      action: '<a class="btn btn-primary" href="/" data-link>去首页逛逛</a>',
                    }
                  : {
                      emoji: '🕘',
                      title: '暂无浏览记录',
                      desc: '打开任意新闻详情后，会自动记录在这里(最多保留 120 条)。',
                      action: '<a class="btn btn-primary" href="/" data-link>去首页逛逛</a>',
                    },
              )
        }
      </div>
    `;

    const body = $('#fav-body');
    const articles = new Map(list.map((item) => [item.id, item]));

    const unbindCards = bindCardInteractions(body, { getArticle: (id) => articles.get(id) });

    const onClick = (event) => {
      const button = event.target.closest('[data-action]');
      if (button) {
        const action = button.dataset.action;
        const id = button.closest('[data-id]')?.dataset.id;

        if (action === 'remove-fav' && id) {
          store.removeFavorite(id);
          toast('已从收藏中移除', 'info', 1800);
          return;
        }
        if (action === 'remove-history' && id) {
          store.removeHistory(id);
          toast('已从历史中移除', 'info', 1800);
          return;
        }
        if (action === 'clear') {
          const label = tab === 'favorites' ? '全部收藏' : '全部浏览历史';
          if (!window.confirm(`确定要清空${label}吗？该操作不可撤销。`)) return;
          if (tab === 'favorites') store.clearFavorites();
          else store.clearHistory();
          toast(`${label}已清空`, 'success', 2000);
          return;
        }
        if (action === 'export') {
          const filename = tab === 'favorites' ? 'ai-news-favorites.json' : 'ai-news-history.json';
          downloadFile(filename, JSON.stringify({ exportedAt: new Date().toISOString(), tab, items: list }, null, 2));
          toast('已开始下载 JSON 文件', 'success', 2200);
          return;
        }
      }

      const tabButton = event.target.closest('[data-tab]');
      if (tabButton) navigate(`/favorites?tab=${tabButton.dataset.tab}`);
    };

    root.addEventListener('click', onClick);
    return () => {
      unbindCards();
      root.removeEventListener('click', onClick);
    };
  }

  let cleanup = render();

  // 收藏/历史变化时自动刷新
  const onFavorites = () => {
    cleanup?.();
    cleanup = render();
  };
  store.addEventListener('favorites:changed', onFavorites);
  store.addEventListener('history:changed', onFavorites);

  return () => {
    cleanup?.();
    store.removeEventListener('favorites:changed', onFavorites);
    store.removeEventListener('history:changed', onFavorites);
  };
}
