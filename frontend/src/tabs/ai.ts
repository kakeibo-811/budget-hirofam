import { el, clear, api, thisMonth } from '../utils';
import { getLocale } from '../i18n';

function L(ja: string, en: string): string {
  return getLocale() === 'en' ? en : ja;
}

export function renderAi(root: HTMLElement) {
  clear(root);
  const month = el('input', { type: 'month', value: thisMonth() }) as HTMLInputElement;
  const mode = el('select', {}, [
    el('option', { value: 'summary' }, [L('数字サマリー', 'Number summary')]),
    el('option', { value: 'tab_spec' }, [L('タブ仕様変更', 'Tab spec change')]),
  ]) as HTMLSelectElement;
  const question = el('textarea', {
    rows: '4',
    class: 'wide-input ai-question',
    placeholder: L('例: 今月の支払いで注意すべき点を教えて / 固定費を期間指定にしたい', 'Ask for a summary or a spec change plan'),
  }) as HTMLTextAreaElement;
  const status = el('div', { class: 'muted' });
  const output = el('pre', { class: 'ai-answer' });
  const history = el('div', { class: 'ai-history' });

  const loadHistory = async () => {
    try {
      const res = await api.get<{ items: any[] }>('/api/ai/history');
      clear(history);
      if (!res.items.length) {
        history.appendChild(el('div', { class: 'muted' }, [L('履歴はまだありません', 'No history yet')]));
        return;
      }
      for (const item of res.items) {
        history.appendChild(el('details', { class: 'ai-history-item' }, [
          el('summary', {}, [`${item.created_at || ''} / ${item.month} / ${item.mode}`]),
          el('div', { class: 'muted' }, [item.question || L('依頼内容なし', 'No request')]),
          el('pre', { class: 'ai-answer ai-history-answer' }, [item.answer || '']),
        ]));
      }
    } catch (e: any) {
      clear(history);
      history.appendChild(el('div', { class: 'banner banner-error' }, [`${L('履歴を読めません', 'Could not load history')}: ${e.message}`]));
    }
  };

  const run = async () => {
    clear(output);
    status.textContent = L('AI確認中...', 'Checking AI...');
    try {
      const res = await api.post<any>('/api/ai/ask', {
        month: month.value,
        mode: mode.value,
        question: question.value,
      });
      status.textContent = res.configured === false
        ? L('AIキー未設定のため、アプリ内サマリーで表示中', 'Showing local summary because AI key is not configured')
        : `${L('使用モデル', 'Model')}: ${res.model}`;
      output.textContent = res.answer || L('回答が空でした', 'Empty answer');
      await loadHistory();
    } catch (e: any) {
      status.textContent = `${L('AIを使えません', 'AI unavailable')}: ${e.message}`;
    }
  };

  root.appendChild(el('section', { class: 'card soft-card ai-panel' }, [
    el('h2', {}, [L('AIアシスタント', 'AI Assistant')]),
    el('p', { class: 'muted' }, [L('家計簿の実データをもとに、数字の要約やタブ仕様の変更案を作ります。カテゴリー分析は使わず、AIは勝手にデータ更新しません。', 'Summarizes numbers and drafts tab specification changes from the app data. Category analysis is not used, and changes are not applied automatically.')]),
    el('div', { class: 'form-grid' }, [
      el('label', {}, [L('対象月', 'Month'), month]),
      el('label', {}, [L('用途', 'Mode'), mode]),
    ]),
    el('label', { class: 'ai-question-wrap' }, [L('依頼内容', 'Request'), question]),
    el('div', { class: 'row-flex' }, [
      el('button', { class: 'btn primary', type: 'button', onClick: run }, [L('AIに聞く', 'Ask AI')]),
      status,
    ]),
  ]));
  root.appendChild(el('section', { class: 'card soft-card' }, [
    el('h3', {}, [L('回答', 'Answer')]),
    output,
  ]));
  root.appendChild(el('section', { class: 'card soft-card' }, [
    el('h3', {}, [L('AI履歴', 'AI History')]),
    history,
  ]));
  loadHistory();
}
