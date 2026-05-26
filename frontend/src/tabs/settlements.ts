import { el, clear, api, formatYen } from '../utils';
import { t } from '../i18n';
import { L } from '../i18n/ui';
import { MonthPicker } from '../components/month-picker';

function metric(label: string, value: string): HTMLElement {
  const m = el('div', { class: 'metric' });
  m.appendChild(el('div', { class: 'metric-label' }, [label]));
  m.appendChild(el('div', { class: 'metric-value' }, [value]));
  return m;
}
function directionLabel(v: string) {
  if (v === 'lisa_to_toshi') return `${t('payer.lisa')} → ${t('payer.toshi')}`;
  if (v === 'toshi_to_lisa') return `${t('payer.toshi')} → ${t('payer.lisa')}`;
  return L('精算不要', 'No settlement');
}

export function renderSettlements(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', {});
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const data = await api.get<any>(`/api/settlements/${month}`);
      clear(content);
      const grid = el('div', { class: 'card-grid' });
      grid.appendChild(metric(L('合計','Total'), formatYen(data.summary.total)));
      grid.appendChild(metric(`${t('payer.toshi')} ${L('実支払','Paid')}`, formatYen(data.summary.toshi_paid)));
      grid.appendChild(metric(`${t('payer.lisa')} ${L('実支払','Paid')}`, formatYen(data.summary.lisa_paid)));
      grid.appendChild(metric(L('妻→夫 振込予定','Wife→Husband due'), formatYen(data.summary.lisa_to_toshi || 0)));
      content.appendChild(grid);
      content.appendChild(el('div', { class: 'banner banner-info' }, [`${L('精算','Settlement')}: ${directionLabel(data.summary.direction)} ${formatYen(data.summary.amount)}`]));

      const adjust = el('details', { class: 'card', open: false }, [el('summary', {}, [L('精算調整を追加', 'Add settlement adjustment')])]);
      const dir = el('select') as HTMLSelectElement;
      [['lisa_to_toshi', `${t('payer.lisa')} → ${t('payer.toshi')}`], ['toshi_to_lisa', `${t('payer.toshi')} → ${t('payer.lisa')}`], ['none', L('メモのみ','Memo only')]].forEach(([v,l]) => dir.appendChild(el('option', { value: v }, [l])));
      const amount = el('input', { type: 'number', placeholder: '10000' }) as HTMLInputElement;
      const desc = el('input', { placeholder: L('調整理由', 'Reason') }) as HTMLInputElement;
      const note = el('input', { placeholder: L('メモ', 'Note') }) as HTMLInputElement;
      adjust.appendChild(el('div', { class: 'form-grid' }, [
        el('label', { class: 'field' }, [el('span', {}, [L('方向','Direction')]), dir]),
        el('label', { class: 'field' }, [el('span', {}, [t('common.amount')]), amount]),
        el('label', { class: 'field' }, [el('span', {}, [t('common.description')]), desc]),
        el('label', { class: 'field' }, [el('span', {}, [t('common.note')]), note]),
      ]));
      adjust.appendChild(el('button', { class: 'btn', onClick: async () => { await api.post(`/api/settlements/${month}/adjustments`, { direction: dir.value, amount: Number(amount.value || 0), description: desc.value, note: note.value }); await load(month); } }, [t('common.save')]));
      content.appendChild(adjust);

      if ((data.adjustments || []).length) {
        const adjCard = el('div', { class: 'card soft-card' }, [
          el('h3', {}, [L('手動調整', 'Manual adjustments')]),
          el('p', { class: 'muted' }, [L('精算の手動調整はこの場で編集・削除できます。保存すると概要・分析にも反映されます。', 'Manual settlement adjustments can be edited or deleted here. Saved changes flow into Dashboard and Analytics.')])
        ]);
        const wrap = el('div', { class: 'table-wrap' });
        const table = el('table', { class: 'data compact-table soft-table' });
        table.innerHTML = `<thead><tr><th>${L('方向','Direction')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th></tr></thead>`;
        const tb = el('tbody');
        for (const a of data.adjustments) {
          const tr = el('tr', { class: 'editable-row' });
          const d = el('select') as HTMLSelectElement;
          [['lisa_to_toshi', `${t('payer.lisa')} → ${t('payer.toshi')}`], ['toshi_to_lisa', `${t('payer.toshi')} → ${t('payer.lisa')}`], ['none', L('メモのみ','Memo only')]].forEach(([v,l]) => d.appendChild(el('option', { value: v }, [l])));
          d.value = a.direction;
          const amt = el('input', { type: 'number', value: String(a.amount || 0) }) as HTMLInputElement;
          const descInput = el('input', { value: a.description || '' }) as HTMLInputElement;
          const noteInput = el('input', { value: a.note || '' }) as HTMLInputElement;
          tr.appendChild(el('td', {}, [d]));
          tr.appendChild(el('td', { class: 'num' }, [amt]));
          tr.appendChild(el('td', {}, [descInput]));
          tr.appendChild(el('td', {}, [noteInput]));
          tr.appendChild(el('td', { class: 'table-actions' }, [
            el('button', { class: 'btn btn-small', onClick: async () => { await api.patch(`/api/settlements/adjustments/${a.id}`, { direction: d.value, amount: Number(amt.value || 0), description: descInput.value, note: noteInput.value }); await load(month); } }, [L('保存','Save')]),
            el('button', { class: 'btn btn-danger btn-small', onClick: async () => { if (!confirm(L('この調整を削除しますか？','Delete this adjustment?'))) return; await api.delete(`/api/settlements/adjustments/${a.id}`); await load(month); } }, [t('common.delete')]),
          ]));
          tb.appendChild(tr);
        }
        table.appendChild(tb); wrap.appendChild(table); adjCard.appendChild(wrap); content.appendChild(adjCard);
      }

      const sec = el('div', { class: 'card soft-card' }, [el('h3', {}, [L('精算対象明細','Settlement evidence')])]);
      const tbl = el('div', { class: 'table-wrap' });
      const tab = el('table', { class: 'data compact-table soft-table' });
      tab.innerHTML = `<thead><tr><th>${L('種別','Type')}</th><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${L('実支払者','Paid by')}</th><th>${L('負担者','Burden')}</th><th>${t('common.description')}</th></tr></thead>`;
      const tbody = el('tbody', {});
      if (data.lines.length === 0) tbody.appendChild(el('tr', {}, [el('td', { colspan: '6', class: 'muted' }, [t('common.no_data')])]));
      for (const l of data.lines) tbody.appendChild(el('tr', {}, [el('td', {}, [l.kind]), el('td', {}, [l.date ?? '—']), el('td', { class: 'num' }, [formatYen(l.amount)]), el('td', {}, [l.paid_by || '—']), el('td', {}, [l.burden_owner || l.payer || l.owner || '—']), el('td', {}, [l.description ?? l.name ?? ''])]));
      tab.appendChild(tbody); tbl.appendChild(tab); sec.appendChild(tbl); content.appendChild(sec);
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー','Error')}: ${e.message}`]));
    }
  }
  picker.onChange(load); load(picker.get());
}
