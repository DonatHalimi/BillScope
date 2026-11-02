import { AppError } from '../lib/http-errors.js';
import { SUPPORTED_CURRENCIES, convertCurrency, listFxHistory, listFxRates } from '../services/fx.js';

const pairQuery = {
  type: 'object', additionalProperties: false,
  required: ['base', 'quote'],
  properties: {
    base: { type: 'string', enum: SUPPORTED_CURRENCIES },
    quote: { type: 'string', enum: SUPPORTED_CURRENCIES },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    limit: { type: 'integer', minimum: 1, maximum: 366 }
  }
};

export async function fxRoutes(app) {
  app.get('/currencies', { preHandler: [app.authenticate] }, async () => ({ currencies: SUPPORTED_CURRENCIES }));

  app.get('/rates', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { base: { type: 'string', enum: SUPPORTED_CURRENCIES } } } }
  }, async (request) => {
    const base = request.query.base || 'EUR';
    return listFxRates(app, base);
  });

  app.get('/history', {
    preHandler: [app.authenticate],
    schema: { querystring: pairQuery },
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }
  }, async (request) => {
    return { history: await listFxHistory(
      app,
      request.query.base,
      request.query.quote,
      request.query.from ? new Date(request.query.from) : undefined,
      request.query.to ? new Date(request.query.to) : undefined,
      request.query.limit || 90
    ) };
  });

  app.post('/convert', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 } } },
      body: {
        type: 'object', additionalProperties: false,
        required: ['amount', 'fromCurrency', 'toCurrency'],
        properties: {
          amount: { type: 'number', exclusiveMinimum: 0, maximum: 1000000000 },
          fromCurrency: { type: 'string', enum: SUPPORTED_CURRENCIES },
          toCurrency: { type: 'string', enum: SUPPORTED_CURRENCIES }
        }
      }
    }
  }, async (request, reply) => {
    if (request.body.fromCurrency === request.body.toCurrency && !Number.isFinite(request.body.amount)) {
      throw new AppError(400, 'Amount is invalid.', 'INVALID_CONVERSION_AMOUNT');
    }
    const result = await convertCurrency(app, {
      userId: request.user.sub,
      idempotencyKey: request.headers['idempotency-key'],
      ...request.body
    });
    reply.header('Cache-Control', 'no-store');
    return result;
  });
}
