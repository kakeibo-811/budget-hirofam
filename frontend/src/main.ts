import { el, clear, api } from './utils';
import { t, getLocale, setLocale, type Locale } from './i18n';
import { renderDashboard } from './tabs/dashboard';
import { renderExpenses } from './tabs/expenses';
import { renderCards } from './tabs/cards';
import { renderAccounts } from './tabs/accounts';
import { renderIncomes } from './tabs/incomes';
import { renderFixed } from './tabs/fixed';
import { renderSettlements } from './tabs/settlements';
import { renderAssets } from './tabs/assets';
import { renderAnalytics } from './tabs/analytics';
import { renderTimeline } from './tabs/timeline';
import { renderAi } from './tabs/ai';
import { renderTutorial } from './tabs/tutorial';
import { renderSettings, renderDiag } from './tabs/settings-and-diag';

type TabKey =
  | 'dashboard' | 'expenses' | 'cards' | 'accounts' | 'incomes'
  | 'fixed' | 'settle' | 'assets' | 'analytics' | 'timeline'
  | 'ai' | 'tutorial' | 'settings' | 'diag';

const defaultTabs: { key: TabKey; icon: string; label: string; render: (root: HTMLElement) => void }[] = [
  { key: 'dashboard', icon: '🏠', label: 'tab.dashboard', render: renderDashboard },
  { key: 'expenses',  icon: '📋', label: 'tab.expenses',  render: renderExpenses },
  { key: 'settle',    icon: '🔄', label: 'tab.settle',    render: renderSettlements },
  { key: 'cards',     icon: '💳', label: 'tab.cards',     render: renderCards },
  { key: 'accounts',  icon: '🏦', label: 'tab.accounts',  render: renderAccounts },
  { key: 'incomes',   icon: '💰', label: 'tab.incomes',   render: renderIncomes },
  { key: 'fixed',     icon: '📌', label: 'tab.fixed',     render: renderFixed },
  { key: 'assets',    icon: '🏘️', label: 'tab.assets',    render: renderAssets },
  { key: 'analytics', icon: '📊', label: 'tab.analytics', render: renderAnalytics },
  { key: 'timeline',  icon: '📈', label: 'tab.timeline',  render: renderTimeline },
  { key: 'ai',        icon: 'AI', label: 'tab.ai',        render: renderAi },
  { key: 'tutorial',  icon: '❓', label: 'tab.tutorial',  render: renderTutorial },
  { key: 'settings',  icon: '⚙️', label: 'tab.settings',  render: renderSettings },
  { key: 'diag',      icon: '🩺', label: 'tab.diag',      render: renderDiag },
];

function orderedTabs() {
  const raw = localStorage.getItem('tabOrder');
  if (!raw) return defaultTabs;
  const order = raw.split(',').filter(Boolean) as TabKey[];
  const known = new Set(defaultTabs.map((t) => t.key));
  const sorted = order.filter((k) => known.has(k)).map((k) => defaultTabs.find((t) => t.key === k)!);
  const missing = defaultTabs.filter((t) => !order.includes(t.key));
  return [...sorted, ...missing];
}

function saveTabOrder(order: TabKey[]) {
  localStorage.setItem('tabOrder', order.join(','));
}

let currentTab: TabKey = (localStorage.getItem('currentTab') as TabKey) || 'dashboard';
if (currentTab === ('messages' as any)) currentTab = 'dashboard';

function renderTabBar() {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  clear(nav);
  for (const tab of orderedTabs()) {
    const btn = el('button', {
      class: 'tab-btn' + (tab.key === currentTab ? ' active' : ''),
      title: t(tab.label as any),
      draggable: 'true',
      onClick: () => switchTab(tab.key),
    }, [
      el('span', { class: 'tab-icon' }, [tab.icon]),
      el('span', { class: 'tab-label' }, [t(tab.label as any)]),
    ]);
    btn.addEventListener('dragstart', (ev) => { ev.dataTransfer?.setData('text/tab-key', tab.key); });
    btn.addEventListener('dragover', (ev) => ev.preventDefault());
    btn.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const from = ev.dataTransfer?.getData('text/tab-key') as TabKey | undefined;
      if (!from || from === tab.key) return;
      const order = orderedTabs().map((t) => t.key);
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(tab.key);
      if (fromIdx < 0 || toIdx < 0) return;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, from);
      saveTabOrder(order);
      renderTabBar();
    });
    nav.appendChild(btn);
  }
}

function switchTab(key: TabKey) {
  currentTab = key;
  localStorage.setItem('currentTab', key);
  renderTabBar();
  const main = document.getElementById('tab-content');
  if (!main) return;
  const tab = orderedTabs().find((t) => t.key === key);
  if (!tab) return;
  tab.render(main);
}

async function init() {
  // ヘッダーセレクタ
  const langSel = document.getElementById('lang-select') as HTMLSelectElement | null;
  if (langSel) {
    langSel.value = getLocale();
    langSel.addEventListener('change', () => {
      setLocale(langSel.value as Locale);
      location.reload();
    });
  }
  const themeSel = document.getElementById('theme-select') as HTMLSelectElement | null;
  if (themeSel) {
    themeSel.value = document.documentElement.dataset.theme || 'pink';
    themeSel.addEventListener('change', () => {
      document.documentElement.dataset.theme = themeSel.value;
      localStorage.setItem('theme', themeSel.value);
    });
  }

  // タイトル更新
  document.title = t('app.title');
  const title = document.querySelector('.app-title');
  if (title) title.textContent = t('app.title');

  // バージョン
  try {
    const meta = await api.get<{ version: string; build: string; env: string; write_enabled: boolean }>('/api/meta');
    const v = document.getElementById('version-display');
    if (v) v.textContent = `${meta.build} · ${meta.version} · ${meta.env}${meta.write_enabled ? '' : ' · RO'}`;
  } catch {
    const v = document.getElementById('version-display');
    if (v) v.textContent = 'offline';
  }

  renderTabBar();
  switchTab(currentTab);
}

init();
