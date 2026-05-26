import { el, clear } from '../utils';
import { getLocale } from '../i18n';
const L = (ja: string, en: string) => getLocale() === 'en' ? en : ja;

export function renderTutorial(root: HTMLElement) {
  clear(root);
  root.appendChild(el('section', { class: 'manual-hero card' }, [
    el('div', { class: 'eyebrow' }, [L('妻向けマニュアル', 'Wife Manual')]),
    el('h2', {}, [L('毎月やることは3つだけ', 'Only three things to do each month')]),
    el('p', { class: 'muted' }, [L('このアプリは、カード明細CSVを取り込み、当月の支払予定と「妻→夫の振込予定額」を確認するための家計管理アプリです。', 'This app helps import card CSVs, review payment plans, and confirm how much Wife should transfer to Husband.')]),
  ]));
  const steps = [
    [L('1. カード明細CSVを明細タブで取り込む', '1. Import card CSV in Expenses'), L('請求書CSVを貼り付け、プレビューで日付・金額・負担者・支払予定日を確認してから確定します。支払予定日は後から手動変更できます。', 'Paste the statement CSV, preview date/amount/burden/payment date, then commit. Payment date can be edited later.')],
    [L('2. 概要タブで妻→夫の振込予定を確認', '2. Check Wife→Husband transfer in Dashboard'), L('最初のタブに、妻が夫へ月末までに払う金額が大きく表示されます。クリックすると精算内訳へ移動できます。', 'The first tab highlights the amount Wife should pay Husband by month end. Tap it to see settlement details.')],
    [L('3. 必要ならメモを書く', '3. Add notes if needed'), L('振込予定カードの下に夫婦メモがあります。新しいメモはハイライトされます。', 'Couple notes appear under the transfer card. New notes are highlighted.')],
  ];
  const grid = el('div', { class: 'card-grid' });
  for (const [title, body] of steps) grid.appendChild(el('div', { class: 'card' }, [el('h3', {}, [title]), el('p', { class: 'muted' }, [body]) ]));
  root.appendChild(grid);
  root.appendChild(el('div', { class: 'card' }, [
    el('h3', {}, [L('用語の意味', 'Terms')]),
    el('ul', {}, [
      el('li', {}, [L('負担者: 最終的に誰が払うべきか。CSVの「支払者」は基本的にこの意味です。', 'Burden owner: who should ultimately bear the cost. CSV payer usually means this.')]),
      el('li', {}, [L('実支払者: 実際にカード/口座から払う人。多くは夫が立替。', 'Paid by: who actually pays by card/account. Often Husband advances it.')]),
      el('li', {}, [L('家計月: 毎月25日〜翌月24日。給与サイクルに合わせた管理月です。', 'Budget month: 25th to 24th, aligned to salary cycle.')]),
      el('li', {}, [L('支払予定日: 実際に口座から出る日。CSV取込後も手動変更できます。', 'Payment date: actual debit/payment date. Can be edited after CSV import.')]),
    ]),
  ]));
}
