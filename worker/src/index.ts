import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { cfAccessAuth } from './middleware/cf-access';
import { writeGuard } from './middleware/write-guard';
import { errorHandler } from './middleware/error-handler';
import expensesRoute from './routes/expenses';
import cardsRoute from './routes/cards';
import accountsRoute from './routes/accounts';
import incomesRoute from './routes/incomes';
import fixedCostsRoute from './routes/fixed-costs';
import settlementsRoute from './routes/settlements';
import assetsRoute from './routes/assets';
import analyticsRoute from './routes/analytics';
import messagesRoute from './routes/messages';
import diagRoute from './routes/diag';
import importExportRoute from './routes/import-export';
import scheduledPaymentsRoute from './routes/scheduled-payments';
import commandsRoute from './routes/commands';
import investmentsRoute from './routes/investments';
import bulkOpsRoute from './routes/bulk-ops';
import aiRoute from './routes/ai';

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  APP_VERSION: string;
  APP_BUILD: string;
  WRITE_ENABLED: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export type Variables = {
  user: { email: string; sub: string } | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
  },
}));
app.use('/api/*', cors({ origin: (origin) => origin, credentials: true }));
app.onError(errorHandler);

app.get('/api/health', async (c) => {
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    dbOk = true;
  } catch (e) {
    dbError = String(e);
  }
  return c.json({
    status: 'ok',
    env: c.env.APP_ENV,
    version: c.env.APP_VERSION,
    build: c.env.APP_BUILD,
    write_enabled: c.env.WRITE_ENABLED === 'true',
    db: { ok: dbOk, error: dbError },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/meta', async (c) => c.json({
  version: c.env.APP_VERSION,
  build: c.env.APP_BUILD,
  env: c.env.APP_ENV,
  write_enabled: c.env.WRITE_ENABLED === 'true',
}));

app.use('/api/*', cfAccessAuth);
app.use('/api/*', writeGuard);

app.route('/api/expenses', expensesRoute);
app.route('/api/cards', cardsRoute);
app.route('/api/accounts', accountsRoute);
app.route('/api/incomes', incomesRoute);
app.route('/api/fixed-costs', fixedCostsRoute);
app.route('/api/settlements', settlementsRoute);
app.route('/api/assets', assetsRoute);
app.route('/api/analytics', analyticsRoute);
app.route('/api/messages', messagesRoute);
app.route('/api/diag', diagRoute);
app.route('/api/io', importExportRoute);
app.route('/api/scheduled-payments', scheduledPaymentsRoute);
app.route('/api/commands', commandsRoute);
app.route('/api/investments', investmentsRoute);
app.route('/api/bulk', bulkOpsRoute);
app.route('/api/ai', aiRoute);
app.get('/api/deploy-marker', (c) => c.json({
  marker: 'DEPLOY_MARKER_20260509_PHASE14_ALL_IN_ONE',
  message: 'Phase14 all-in-one worker code is deployed.',
}));

app.get('*', async (c) => {
  try {
    const url = new URL(c.req.url);
    if (!url.pathname.startsWith('/assets/') && url.pathname !== '/favicon.ico' && !url.pathname.includes('.')) {
      url.pathname = '/index.html';
      return await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
    }
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch (e) {
    return c.text('STATIC_ASSETS_BINDING_ACTIVE: ' + String(e), 503);
  }
});

export default app;
