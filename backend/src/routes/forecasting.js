import { AppError } from '../lib/http-errors.js';
import { calculateForecast } from '../services/forecasting.js';
import { asNumber, SUPPORTED_CURRENCIES } from '../lib/money.js';

export async function forecastingRoutes(app) {
  app.get('/summary', { preHandler: [app.authenticate] }, async (request) => ({
    forecast: await calculateForecast(app.prisma, request.user.sub)
  }));

  app.get('/income', { preHandler: [app.authenticate] }, async (request) => {
    const incomes = await app.prisma.scheduledIncome.findMany({ where: { userId: request.user.sub }, orderBy: { expectedAt: 'asc' } });
    return { incomes: incomes.map((income) => ({ ...income, amount: asNumber(income.amount) })) };
  });

  app.post('/income', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['description', 'amount', 'expectedAt', 'period'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 100 },
          amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
          currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
          expectedAt: { type: 'string', format: 'date-time' },
          period: { type: 'string', enum: ['ONCE', 'WEEKLY', 'MONTHLY', 'YEARLY'] }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body;
    const description = body.description.trim();
    if (!description) throw new AppError(400, 'Income description is required.', 'INCOME_DESCRIPTION_REQUIRED');
    const user = await app.prisma.user.findUnique({ where: { id: request.user.sub }, select: { preferredCurrency: true } });
    if (!user) throw new AppError(401, 'Session is no longer valid.', 'SESSION_INVALID');
    const currency = body.currency || user.preferredCurrency;
    const income = await app.prisma.scheduledIncome.create({ data: {
      userId: request.user.sub,
      description,
      amount: body.amount,
      currency,
      expectedAt: new Date(body.expectedAt),
      period: body.period,
      active: true
    } });
    return reply.code(201).send({ income: { ...income, amount: asNumber(income.amount) } });
  });

  app.patch('/income/:id/active', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['active'], properties: { active: { type: 'boolean' } } } }
  }, async (request) => {
    const owned = await app.prisma.scheduledIncome.findFirst({ where: { id: request.params.id, userId: request.user.sub }, select: { id: true } });
    if (!owned) throw new AppError(404, 'Scheduled income not found.', 'INCOME_NOT_FOUND');
    const income = await app.prisma.scheduledIncome.update({ where: { id: owned.id }, data: { active: request.body.active } });
    return { income: { ...income, amount: asNumber(income.amount) } };
  });
}
