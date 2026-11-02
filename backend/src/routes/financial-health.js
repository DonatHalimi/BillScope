import { AppError } from '../lib/http-errors.js';
import { drillDownSpending, getFinancialHealthDashboard, recomputeFinancialHealth } from '../services/financial-health.js';

export async function financialHealthRoutes(app) {
  app.get('/summary', { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    return getFinancialHealthDashboard(app, request.user.sub);
  });

  app.post('/recompute', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } }
  }, async (request) => ({ snapshot: await recomputeFinancialHealth(app, request.user.sub) }));

  app.get('/drilldown', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        required: ['category'],
        properties: {
          category: { type: 'string', minLength: 1, maxLength: 60 },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request) => {
    if (request.query.from && request.query.to && new Date(request.query.from) > new Date(request.query.to)) {
      throw new AppError(400, 'The start date must not be after the end date.', 'INVALID_DATE_RANGE');
    }
    return drillDownSpending(
      app,
      request.user.sub,
      request.query.category,
      request.query.from ? new Date(request.query.from) : undefined,
      request.query.to ? new Date(request.query.to) : undefined,
      request.query.limit || 100
    );
  });
}
