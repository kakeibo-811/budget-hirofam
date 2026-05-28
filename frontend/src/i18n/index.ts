export type Locale = 'ja' | 'en';

export const dict = {
  ja: {
    'app.title': '夫婦家計簿',
    'tab.dashboard': '概要',
    'tab.expenses': '明細',
    'tab.cards': 'カード',
    'tab.accounts': '口座',
    'tab.incomes': '収入',
    'tab.fixed': '固定費',
    'tab.settle': '精算',
    'tab.assets': '資産負債',
    'tab.analytics': '分析',
    'tab.timeline': 'タイムライン',
    'tab.ai': 'AI',
    'tab.messages': 'メモ',
    'tab.tutorial': '使い方',
    'tab.settings': '設定',
    'tab.diag': '診断',

    'common.month': '月',
    'common.prev': '前月',
    'common.next': '次月',
    'common.today': '今月',
    'common.amount': '金額',
    'common.date': '日付',
    'common.payer': '支払者',
    'common.card': 'カード',
    'common.category': 'カテゴリ',
    'common.note': 'メモ',
    'common.description': '内容',
    'common.billing_month': '請求月',
    'common.payment_date': '支払予定日',
    'common.close_day': '締め日',
    'common.pay_day': '支払日',
    'common.preview': 'プレビュー',
    'common.commit': '確定登録',
    'common.warning': '警告',
    'common.owner': '所有者',
    'common.actions': '操作',
    'common.add': '追加',
    'common.edit': '編集',
    'common.delete': '削除',
    'common.save': '保存',
    'common.cancel': 'キャンセル',
    'common.undo': '元に戻す',
    'common.export': 'エクスポート',
    'common.import': '取り込み',
    'common.loading': '読み込み中…',
    'common.no_data': 'データがありません',
    'common.read_only': '読み取り専用モード（書き込みは無効）',
    'common.write_disabled_hint': '書き込みは feature flag で OFF になっています。READMEを参照してください。',

    'payer.toshi': '夫',
    'payer.lisa': '妻',
    'payer.shared': '共同',
    'payer.other': 'その他',

    'owner.toshi': '夫',
    'owner.lisa': '妻',
    'owner.shared': '共同',
    'owner.other': 'その他',

    'dash.income': '収入',
    'dash.expense': '支出',
    'dash.fixed': '固定費',
    'dash.settle': '夫婦間精算',
    'dash.cards': 'カード請求',
    'dash.accounts': '口座残高',
    'dash.assets': '資産・負債',

    'settings.theme': 'テーマ',
    'settings.language': '言語',

    'tutorial.intro': '初めての方へ',
    'tutorial.toshi_section': '夫向けの使い方',
    'tutorial.lisa_section': '妻向けの使い方',

    'diag.tables': 'テーブル一覧',
    'diag.summary': '件数サマリ',
    'diag.health': 'ヘルスチェック',
    'diag.policy': '運用ポリシー',
    'diag.checklist': '要件チェック',
    'diag.import_batches': '取り込み履歴',
  },
  en: {
    'app.title': 'Budget HiroFam',
    'tab.dashboard': 'Dashboard',
    'tab.expenses': 'Expenses',
    'tab.cards': 'Cards',
    'tab.accounts': 'Accounts',
    'tab.incomes': 'Income',
    'tab.fixed': 'Fixed Costs',
    'tab.settle': 'Settlement',
    'tab.assets': 'Assets & Liabilities',
    'tab.analytics': 'Analytics',
    'tab.timeline': 'Timeline',
    'tab.ai': 'AI',
    'tab.messages': 'Messages',
    'tab.tutorial': 'Manual',
    'tab.settings': 'Settings',
    'tab.diag': 'Diagnostics',

    'common.month': 'Month',
    'common.prev': 'Prev',
    'common.next': 'Next',
    'common.today': 'This Month',
    'common.amount': 'Amount',
    'common.date': 'Date',
    'common.payer': 'Payer',
    'common.card': 'Card',
    'common.category': 'Category',
    'common.note': 'Note',
    'common.description': 'Description',
    'common.billing_month': 'Billing Month',
    'common.payment_date': 'Payment Date',
    'common.close_day': 'Closing Day',
    'common.pay_day': 'Payment Day',
    'common.preview': 'Preview',
    'common.commit': 'Commit',
    'common.warning': 'Warnings',
    'common.owner': 'Owner',
    'common.actions': 'Actions',
    'common.add': 'Add',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.undo': 'Undo',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.loading': 'Loading…',
    'common.no_data': 'No data',
    'common.read_only': 'Read-only mode (writes disabled)',
    'common.write_disabled_hint': 'Writes are disabled via feature flag. See README.',

    'payer.toshi': 'Husband',
    'payer.lisa': 'Wife',
    'payer.shared': 'Shared',
    'payer.other': 'Other',

    'owner.toshi': 'Husband',
    'owner.lisa': 'Wife',
    'owner.shared': 'Shared',
    'owner.other': 'Other',

    'dash.income': 'Income',
    'dash.expense': 'Expenses',
    'dash.fixed': 'Fixed Costs',
    'dash.settle': 'Settlement',
    'dash.cards': 'Card Billing',
    'dash.accounts': 'Balances',
    'dash.assets': 'Assets',

    'settings.theme': 'Theme',
    'settings.language': 'Language',

    'tutorial.intro': 'Getting started',
    'tutorial.toshi_section': 'For Toshi',
    'tutorial.lisa_section': 'For Lisa',

    'diag.tables': 'Tables',
    'diag.summary': 'Summary',
    'diag.health': 'Health',
    'diag.policy': 'Policy',
    'diag.checklist': 'Checklist',
    'diag.import_batches': 'Import Batches',
  },
} as const;

export type DictKey = keyof typeof dict.ja;

let currentLocale: Locale = (localStorage.getItem('locale') as Locale) || 'ja';

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(l: Locale): void {
  currentLocale = l;
  localStorage.setItem('locale', l);
  document.documentElement.lang = l;
}

export function t(key: DictKey): string {
  return (dict[currentLocale] as any)[key] || (dict.ja as any)[key] || key;
}
