// API クライアント。同一オリジンの /api を叩く前提。
// Cloudflare Access 経由の場合、ブラウザは Access cookie を自動送信する。

export type ApiError = {
  error: string;
  detail?: string;
  code?: string;
};

export class ApiException extends Error {
  status: number;
  detail?: string;
  code?: string;
  constructor(status: number, body: ApiError) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.detail = body.detail;
    this.code = body.code;
  }
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    let err: ApiError = { error: `HTTP ${res.status}` };
    try { err = await res.json(); } catch {}
    throw new ApiException(res.status, err);
  }
  if (res.status === 204) return undefined as T;
  return await res.json() as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: any) => request<T>('POST', path, body),
  put: <T>(path: string, body: any) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: any) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// 数値フォーマット（カンマ区切り）
export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('ja-JP');
}

export function formatYen(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '¥' + n.toLocaleString('ja-JP');
}

// 月文字列ユーティリティ
export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(month: string, locale: 'ja' | 'en'): string {
  const [y, m] = month.split('-');
  if (locale === 'ja') return `${y}年${m}月`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${y}`;
}

// シンプルなDOM helper
export function el(tag: string, attrs: Record<string, any> = {}, children: (string | Node)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v as string;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

export function clear(node: HTMLElement) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
