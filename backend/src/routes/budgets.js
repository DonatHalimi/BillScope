import { AppError } from '../lib/http-errors.js';
import { asNumber, SUPPORTED_CURRENCIES } from '../lib/money.js';

function startOfPeriod(now, period) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'WEEKLY') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else start.setDate(1);
  return start;
}

export async function budgetRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const now = new Date();
    const budgets = await app.prisma.spendingLimit.findMany({ where: { userId: request.user.sub }, orderBy: { category: 'asc' } });
    const result = await Promise.all(budgets.map(async (budget) => {
      const start = startOfPeriod(now, budget.period);
      const spent = await app.prisma.transaction.aggregate({
        where: {
          userId: request.user.sub,
          category: budget.category,
          currency: budget.currency,
          type: 'EXPENSE',
          status: 'POSTED',
          occurredAt: { gte: start, lte: now }
        },
        _sum: { amount: true }
      });
      const limit = asNumber(budget.amount);
      const used = asNumber(spent._sum.amount);
      return { ...budget, amount: limit, spent: used, remaining: Math.max(0, Math.round((limit - used) * 100) / 100), percentUsed: limit ? Math.round((used / limit) * 100) : 0 };
    }));
    return { budgets: result };
  });

  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['name', 'category', 'amount', 'period'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          category: { type: 'string', minLength: 1, maxLength: 60 },
          amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
          currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
          period: { type: 'string', enum: ['WEEKLY', 'MONTHLY'] },
          enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body;
    const name = body.name.trim();
    const category = body.category.trim();
    if (!name || !category) throw new AppError(400, 'Budget name and category are required.', 'BUDGET_FIELDS_REQUIRED');
    try {
      const budget = await app.prisma.spendingLimit.upsert({
        where: { userId_category_period: { userId: request.user.sub, category, period: body.period } },
        create: {
          userId: request.user.sub,
          name, category, amount: body.amount,
          currency: body.currency || 'EUR', period: body.period, enabled: body.enabled !== false
        },
        update: { name, amount: body.amount, currency: body.currency || 'EUR', enabled: body.enabled !== false }
      });
      return reply.code(201).send({ budget: { ...budget, amount: asNumber(budget.amount) } });
    } catch (error) {
      if (error?.code === 'P2002') throw new AppError(409, 'A budget already exists for this category and period.', 'BUDGET_EXISTS');
      throw error;
    }
  });

  app.patch('/:id/enabled', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } } }
  }, async (request) => {
    const owned = await app.prisma.spendingLimit.findFirst({ where: { id: request.params.id, userId: request.user.sub }, select: { id: true } });
    if (!owned) throw new AppError(404, 'Spending limit not found.', 'BUDGET_NOT_FOUND');
    const budget = await app.prisma.spendingLimit.update({ where: { id: owned.id }, data: { enabled: request.body.enabled } });
    return { budget: { ...budget, amount: asNumber(budget.amount) } };
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.spendingLimit.deleteMany({ where: { id: request.params.id, userId: request.user.sub } });
    if (!result.count) throw new AppError(404, 'Spending limit not found.', 'BUDGET_NOT_FOUND');
    return reply.code(204).send();
  });
}
