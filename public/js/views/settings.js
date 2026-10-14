/**
 * 设置页：偏好项、来源筛选、数据管理、服务端能力诊断。
 * 页面上只展示「能力状态」，不接受也不保存任何 API Key —— 密钥永远只存在于服务端 .env。
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { $, downloadFile, escapeHtml, fmtNumber } from '../utils.js';
import { navigate } from '../router.js';
import { toast } from '../ui/feedback.js';

/** 重新渲染设置页(走 router，保证旧监听器被正确清理) */
const rerender = () => navigate('/settings', { scroll: false });

export default async function settingsView(root) {
  const settings = store.settings;
  const capabilities = store.capabilities || {};
  const ai = capabilities.ai || {};
  const stats = store.stats();

  root.innerHTML = `
    <div class="page-head">
      <h1>⚙️ 设置</h1>
      <p>所有偏好保存在浏览器本地；API 密钥由后端 .env 管理，浏览器无法读取也无法修改</p>
    </div>

    <section class="sidebar-card" style="margin-bottom:18px">
      <h3>服务端状态</h3>
      <div class="kv"><span class="k">新闻源</span><span class="v">${escapeHtml(providerLabel(capabilities))}</span></div>
      <div class="kv"><span class="k">AI 总结</span><span class="v">${escapeHtml(ai.reason || '未知')}</span></div>
      <div class="kv"><span class="k">模型</span><span class="v">${escapeHtml(ai.model || '—')}${ai.mock ? ' (演示模式)' : ''}</span></div>
      <div class="kv"><span class="k">正文抓取</span><span class="v">${capabilities.articleExtract ? '已启用(提升总结质量)' : '已关闭'}</span></div>
      <div class="kv"><span class="k">.env</span><span class="v">${capabilities.envFileLoaded ? '已加载' : '未找到'}</span></div>
      <div class="kv"><span class="k">可用 provider</span><span class="v">${(capabilities.availableProviders || []).map(escapeHtml).join(' / ') || '—'}</span></div>
      <div class="kv"><span class="k">健康检查</span><span class="v" id="health-value">待检测…</span></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-sm" data-action="check-health">重新检测</button>
        <button class="btn btn-sm" data-action="clear-ai-cache">清空服务端 AI 缓存</button>
      </div>
      <div class="hint">
        想启用真实 AI 总结？在项目根目录 <code>.env</code> 中填写
        <code>DEEPSEEK_API_KEY=sk-xxxx</code> 与 <code>AI_MOCK=0</code>，然后重启服务即可。详见 README。
      </div>
    </section>

    <section class="sidebar-card" style="margin-bottom:18px">
      <h3>阅读偏好</h3>

      <div class="switch-row">
        <div>
          <div class="label">主题</div>
          <div class="desc">深色 / 浅色 / 跟随系统</div>
        </div>
        <select id="setting-theme" style="width:auto;min-width:130px">
          ${selectOptions(
            [
              ['system', '跟随系统'],
              ['dark', '深色'],
              ['light', '浅色'],
            ],
            settings.theme,
          )}
        </select>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">每页条数</div>
          <div class="desc">首页与搜索页的列表分页大小</div>
        </div>
        <select id="setting-pageSize" style="width:auto;min-width:110px">
          ${selectOptions(
            [
              [8, '8 条'],
              [12, '12 条'],
              [16, '16 条'],
              [24, '24 条'],
            ],
            String(settings.pageSize),
          )}
        </select>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">默认分类</div>
          <div class="desc">打开首页时默认选中的分类</div>
        </div>
        <select id="setting-category" style="width:auto;min-width:130px">
          ${(store.categories || []).map((item) => `<option value="${escapeHtml(item.key)}" ${item.key === settings.defaultCategory ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
        </select>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">AI 总结语言</div>
          <div class="desc">摘要与要点的输出语言</div>
        </div>
        <select id="setting-language" style="width:auto;min-width:130px">
          ${selectOptions(
            [
              ['zh', '简体中文'],
              ['en', 'English'],
            ],
            settings.language,
          )}
        </select>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">打开详情页自动生成 AI 总结</div>
          <div class="desc">关闭后需手动点击「生成 AI 总结」；已生成的总结会缓存在本地</div>
        </div>
        <button class="switch" role="switch" aria-checked="${settings.autoSummarize}" data-toggle="autoSummarize"></button>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">紧凑模式</div>
          <div class="desc">隐藏卡片配图，一屏显示更多标题</div>
        </div>
        <button class="switch" role="switch" aria-checked="${settings.compactCards}" data-toggle="compactCards"></button>
      </div>

      <div class="switch-row">
        <div>
          <div class="label">搜索时包含 Hacker News</div>
          <div class="desc">关闭可只搜索已聚合的 AI 新闻池</div>
        </div>
        <button class="switch" role="switch" aria-checked="${!settings.hideCommunity}" data-toggle="includeCommunity"></button>
      </div>
    </section>

    <section class="sidebar-card" style="margin-bottom:18px">
      <h3>来源筛选(首页只显示勾选的来源)</h3>
      <div class="chips" id="source-chips">
        ${(store.sources || [])
          .map((item) => {
            const active = !settings.sourcesFilter?.length || settings.sourcesFilter.includes(item.id);
            return `<button class="chip ${active ? 'is-active badge-brand' : ''}" data-source="${escapeHtml(item.id)}"
                      style="${active ? 'border-color:var(--brand);color:var(--brand)' : ''}">
                      ${active ? '✓' : '＋'} ${escapeHtml(item.name)}${item.lang === 'zh' ? ' · 中文' : ''}
                    </button>`;
          })
          .join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-sm" data-action="select-all-sources">全选</button>
        <button class="btn btn-sm" data-action="select-none-sources">清空筛选(显示全部)</button>
      </div>
      <div class="hint">勾选后首页只显示这些来源的新闻，分类 Tab 上的数字会同步更新。全部勾选等于不筛选。</div>
    </section>

    <section class="sidebar-card" style="margin-bottom:18px">
      <h3>本地数据</h3>
      <div class="kv"><span class="k">收藏</span><span class="v">${fmtNumber(stats.favorites)} 条</span></div>
      <div class="kv"><span class="k">历史</span><span class="v">${fmtNumber(stats.history)} 条</span></div>
      <div class="kv"><span class="k">已缓存 AI 总结</span><span class="v">${fmtNumber(stats.summaries)} 条</span></div>
      <div class="kv"><span class="k">localStorage 占用</span><span class="v">${(stats.bytes / 1024).toFixed(1)} KB</span></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-sm" data-action="export-all">⬇ 导出全部数据</button>
        <button class="btn btn-sm" data-action="clear-summaries">清空 AI 总结缓存</button>
        <button class="btn btn-sm btn-danger" data-action="clear-all">清空收藏与历史</button>
      </div>
    </section>

    <section class="sidebar-card">
      <h3>关于</h3>
      <p style="color:var(--text-muted);font-size:13.5px;margin-bottom:8px">
        AI News Digest · 新闻聚合自各站点公开 RSS，版权归原作者所有；摘要由 DeepSeek 生成，可能存在偏差，请以原文为准。
      </p>
      <div class="kv"><span class="k">前端</span><span class="v">原生 ES Modules + History API 路由(零构建)</span></div>
      <div class="kv"><span class="k">后端</span><span class="v">Node.js + Express · 代理全部密钥</span></div>
    </section>
  `;

  checkHealth();

  /* ---------- 交互 ---------- */
  const onClick = async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const key = toggle.dataset.toggle;
      if (key === 'includeCommunity') {
        const next = toggle.getAttribute('aria-checked') !== 'true';
        toggle.setAttribute('aria-checked', String(next));
        store.updateSettings({ hideCommunity: !next });
      } else {
        const next = toggle.getAttribute('aria-checked') !== 'true';
        toggle.setAttribute('aria-checked', String(next));
        store.updateSettings({ [key]: next });
      }
      toast('设置已保存', 'success', 1500);
      return;
    }

    const sourceChip = event.target.closest('[data-source]');
    if (sourceChip) {
      const id = sourceChip.dataset.source;
      const all = (store.sources || []).map((item) => item.id);
      let current = settings.sourcesFilter?.length ? [...settings.sourcesFilter] : [...all];
      current = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      // 全选等价于「不筛选」
      store.updateSettings({ sourcesFilter: current.length === all.length ? [] : current });
      render();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'select-all-sources') {
      store.updateSettings({ sourcesFilter: [] });
      render();
    }
    if (action === 'select-none-sources') {
      store.updateSettings({ sourcesFilter: [] });
      render();
    }
    if (action === 'check-health') checkHealth();
    if (action === 'clear-ai-cache') {
      try {
        const result = await api.clearAiCache();
        toast(`服务端已清空 ${result.cleared} 条 AI 缓存`, 'success');
      } catch (error) {
        toast(`清空失败：${error.message}`, 'error');
      }
    }
    if (action === 'export-all') {
      downloadFile(
        'ai-news-data.json',
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            settings: store.settings,
            favorites: store.favorites,
            history: store.history,
          },
          null,
          2,
        ),
      );
      toast('已开始下载全部本地数据', 'success');
    }
    if (action === 'clear-summaries') {
      store.clearSummaries();
      toast('已清空本地 AI 总结缓存', 'success');
      render();
    }
    if (action === 'clear-all') {
      if (!window.confirm('确定要清空收藏与浏览历史吗？该操作不可撤销。')) return;
      store.clearFavorites();
      store.clearHistory();
      toast('已清空收藏与历史', 'success');
      render();
    }
  };

  const onChange = (event) => {
    const id = event.target.id;
    if (id === 'setting-theme') {
      store.updateSettings({ theme: event.target.value });
    }
    if (id === 'setting-pageSize') {
      store.updateSettings({ pageSize: Number(event.target.value) || 12 });
    }
    if (id === 'setting-category') {
      store.updateSettings({ defaultCategory: event.target.value });
    }
    if (id === 'setting-language') {
      store.updateSettings({ language: event.target.value });
      toast('语言已切换，重新打开新闻即可看到对应语言的总结', 'info', 2600);
    }
    if (id.startsWith('setting-')) toast('设置已保存', 'success', 1500);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  async function checkHealth() {
    const host = $('#health-value');
    if (!host) return;
    host.textContent = '检测中…';
    try {
      const health = await api.getHealth();
      host.textContent = `正常 · 运行 ${health.uptimeSeconds}s · ${fmtNumber(health.cache?.entries || 0)} 项缓存`;
    } catch (error) {
      host.textContent = `异常：${error.message}`;
    }
  }

  function render() {
    rerender();
  }

  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}

function selectOptions(pairs, current) {
  return pairs
    .map(([value, label]) => `<option value="${escapeHtml(String(value))}" ${String(value) === String(current) ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function providerLabel(capabilities) {
  const provider = capabilities.provider || 'rss';
  const labels = {
    rss: 'RSS 聚合(免密钥)',
    gnews: 'GNews API',
    newsapi: 'NewsAPI.org',
  };
  return labels[provider] || provider;
}
