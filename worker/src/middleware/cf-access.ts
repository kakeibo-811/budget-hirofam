import type { Context, Next } from 'hono';
import type { Env, Variables } from '../index';

/**
 * Cloudflare Access JWT verification.
 *
 * Cloudflare Access が前段で認証を行い、Cf-Access-Jwt-Assertion ヘッダーに JWT を載せて転送してくる。
 * Worker 側はこの JWT を検証することで、Access を経由していないリクエスト（直接 worker URL を叩く攻撃）を弾く。
 *
 * 検証手順：
 * 1. Cf-Access-Jwt-Assertion ヘッダーを取得
 * 2. team_domain の JWKS から公開鍵を取得（キャッシュ可）
 * 3. 署名・aud・iss・有効期限を検証
 * 4. 通過したら c.set('user', ...) で email を保存
 *
 * 開発・preview 初期は CF_ACCESS_AUD が空なら検証スキップ（ローカル動作確認のため）。
 */

type AccessPayload = {
  aud: string | string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  nbf: number;
  sub: string;
};

let cachedJwks: { keys: any[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchJwks(teamDomain: string): Promise<any[]> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: any[] };
  cachedJwks = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importJwk(jwk: any): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<AccessPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { kid: string; alg: string };
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as AccessPayload;

  // aud check
  const audValues = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audValues.includes(expectedAud)) {
    throw new Error('JWT aud mismatch');
  }

  // exp check
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('JWT expired');
  if (payload.nbf && payload.nbf > now + 30) throw new Error('JWT not yet valid');

  // iss check
  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) throw new Error('JWT iss mismatch');

  // signature check
  const jwks = await fetchJwks(teamDomain);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`JWK not found for kid=${header.kid}`);

  const key = await importJwk(jwk);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signedData
  );
  if (!valid) throw new Error('JWT signature invalid');

  return payload;
}

export async function cfAccessAuth(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = c.env.CF_ACCESS_AUD;

  // ヘルスチェックは認証不要（既に index.ts 側で除外しているが念のため）
  if (c.req.path === '/api/health' || c.req.path === '/api/meta') {
    return next();
  }

  // 開発モード：Access 未設定なら検証スキップ（local dev 用）
  if (!teamDomain || !aud) {
    if (c.env.APP_ENV === 'production') {
      return c.json(
        { error: 'Cloudflare Access is not configured for production' },
        503
      );
    }
    c.set('user', { email: 'dev@local', sub: 'dev' });
    return next();
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) {
    return c.json({ error: 'Missing Cf-Access-Jwt-Assertion' }, 401);
  }

  try {
    const payload = await verifyAccessJwt(token, teamDomain, aud);
    c.set('user', { email: payload.email, sub: payload.sub });
    return next();
  } catch (e: any) {
    return c.json({ error: 'Access verification failed', detail: e.message }, 401);
  }
}
