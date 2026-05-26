import { el, clear, api } from '../utils';
import { t } from '../i18n';
import { L } from '../i18n/ui';
import { MonthPicker } from '../components/month-picker';

function messageAuthorLabel(author: any): string {
  const raw = String(author || '').trim();
  if (!raw || raw === 'dev@local' || raw === 'unknown' || raw === '夫婦メモ') return '';
  return raw;
}
function messageMeta(m: any): string {
  const author = messageAuthorLabel(m.author);
  return author ? `${author} · ${m.created_at}` : String(m.created_at || '');
}

export function renderMessages(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  root.appendChild(picker.element());
  const content = el('div', {});
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    try {
      const data = await api.get<{ items: any[] }>(`/api/messages?month=${month}`);
      const sec = el('div', { class: 'card' }, [el('h3', {}, [`${month} ${L('メッセージ','Messages')}`])]);
      if (data.items.length === 0) {
        sec.appendChild(el('div', { class: 'muted' }, [t('common.no_data')]));
      } else {
        for (const m of data.items) {
          const item = el('div', { class: 'card' });
          item.appendChild(el('div', { class: 'muted' }, [messageMeta(m)]));
          item.appendChild(el('div', {}, [m.body]));
          sec.appendChild(item);
        }
      }
      content.appendChild(sec);
      content.appendChild(el('div', { class: 'banner banner-info' }, [t('common.read_only')]));
    } catch (e: any) {
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー','Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}
