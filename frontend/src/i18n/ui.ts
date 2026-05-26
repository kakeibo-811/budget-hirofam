import { getLocale } from './index';

export function L(ja: string, en: string): string {
  return getLocale() === 'en' ? en : ja;
}

export function ownerText(value?: string): string {
  const v = (value || '').toLowerCase();
  if (v === 'toshi' || v === 'husband') return L('夫', 'Husband');
  if (v === 'lisa' || v === 'wife') return L('妻', 'Wife');
  if (v === 'shared' || v === 'joint') return L('共同', 'Shared');
  if (v === 'other') return L('その他', 'Other');
  return value || '—';
}

export function burdenOptions(): [string, string][] {
  return [
    ['shared', L('折半/共同', 'Split / Shared')],
    ['lisa', L('妻負担', 'Wife burden')],
    ['toshi', L('夫負担', 'Husband burden')],
    ['other', L('対象外', 'Excluded')],
  ];
}

export function payerOptions(): [string, string][] {
  return [
    ['toshi', L('夫が払う', 'Paid by Husband')],
    ['lisa', L('妻が払う', 'Paid by Wife')],
    ['shared', L('共同口座', 'Shared account')],
  ];
}

export function frequencyOptions(): [string, string][] {
  return [
    ['monthly', L('毎月', 'Monthly')],
    ['once', L('1回のみ', 'One-time')],
    ['yearly', L('毎年', 'Yearly')],
    ['every_3_years', L('3年ごと', 'Every 3 years')],
    ['every_5_years', L('5年ごと', 'Every 5 years')],
    ['irregular', L('不定期', 'Irregular')],
  ];
}

export function frequencyText(value?: string): string {
  const v = (value || '').toLowerCase();
  if (v === 'monthly') return L('毎月', 'Monthly');
  if (v === 'once') return L('1回のみ', 'One-time');
  if (v === 'yearly') return L('毎年', 'Yearly');
  if (v === 'every_3_years') return L('3年ごと', 'Every 3 years');
  if (v === 'every_5_years') return L('5年ごと', 'Every 5 years');
  if (v === 'irregular') return L('不定期', 'Irregular');
  return value || '—';
}
