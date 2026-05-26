import { el, thisMonth, shiftMonth, formatMonth } from '../utils';
import { getLocale, t } from '../i18n';

/**
 * 月セレクタ（要件：月選択UIは1か所に集約）。
 * - 前月
 * - 表示
 * - 次月
 * - 今月
 * - 年月直接選択
 */
export class MonthPicker {
  private container: HTMLElement;
  private month: string;
  private displayEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private listeners: ((m: string) => void)[] = [];

  constructor(initialMonth?: string) {
    this.month = initialMonth || thisMonth();
    this.displayEl = el('div', { class: 'month-display' });
    this.inputEl = el('input', { type: 'month', value: this.month }) as HTMLInputElement;
    this.inputEl.addEventListener('change', () => {
      if (this.inputEl.value) this.set(this.inputEl.value);
    });

    this.container = el('div', { class: 'month-picker' }, [
      el('button', { onClick: () => this.set(shiftMonth(this.month, -1)) }, [t('common.prev')]),
      this.displayEl,
      el('button', { onClick: () => this.set(shiftMonth(this.month, 1)) }, [t('common.next')]),
      el('button', { onClick: () => this.set(thisMonth()) }, [t('common.today')]),
      this.inputEl,
    ]);
    this.refresh();
  }

  private refresh() {
    this.displayEl.textContent = formatMonth(this.month, getLocale());
    this.inputEl.value = this.month;
  }

  set(month: string) {
    this.month = month;
    this.refresh();
    for (const l of this.listeners) l(month);
  }

  get(): string {
    return this.month;
  }

  onChange(fn: (m: string) => void) {
    this.listeners.push(fn);
  }

  element(): HTMLElement {
    return this.container;
  }
}
