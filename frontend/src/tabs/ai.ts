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
    el('option', { value: 'spec' }, [L('仕様変更案', 'Spec change plan')]),
  ]) as HTMLSelectElement;
  const question = el('textarea', {
    rows: '4',
    class: 'wide-input ai-question',
    placeholder: L('例: 今月の支払いで注意すべき点を教えて / 固定費を期間指定にしたい', 'Ask for a summary or a spec change plan'),
  }) as HTMLTextAreaElement;
  const status = el('div', { class: 'muted' });
  const output = el('pre', { class: 'ai-answer' });

  const run = async () => {
    clear(output);
    status.textContent = L('AI確認中...', 'Checking AI...');
    try {
      const res = await api.post<any>('/api/ai/ask', {
        month: month.value,
        mode: mode.value,
        question: question.value,
      });
      status.textContent = `${L('使用モデル', 'Model')}: ${res.model}`;
      output.textContent = res.answer || L('回答が空でした', 'Empty answer');
    } catch (e: any) {
      status.textContent = `${L('AIを使えません', 'AI unavailable')}: ${e.message}`;
    }
  };

  root.appendChild(el('section', { class: 'card soft-card ai-panel' }, [
    el('h2', {}, [L('AIアシスタント', 'AI Assistant')]),
    el('p', { class: 'muted' }, [L('家計簿の実データをもとに、数字の要約や仕様変更案を作ります。AIは変更案を出すだけで、勝手にデータ更新はしません。', 'Summarizes numbers and drafts change plans from the app data. It does not apply changes automatically.')]),
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
}
