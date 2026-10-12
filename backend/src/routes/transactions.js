import { AppError } from '../lib/http-errors.js';
import { suggestCategory } from '../lib/categorize.js';
import { recordTransaction } from '../services/transactions.js';
import { asNumber } from '../lib/money.js';

const createSchema = {
  body: {
    type: 'object', additionalProperties: false,
    required: ['accountId', 'type', 'amount', 'description'],
    properties: {
      accountId: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
      amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
      description: { type: 'string', minLength: 1, maxLength: 180 },
      merchant: { type: 'string', maxLength: 120 },
      category: { type: 'string', maxLength: 60 },
      occurredAt: { type: 'string', format: 'date-time' }
    }
  }
};

export async function transactionRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '25', 10) || 25));
    const cursor = request.query.cursor;
    const where = { userId: request.user.sub };
    if (request.query.type && ['INCOME', 'EXPENSE', 'TRANSFER'].includes(request.query.type)) where.type = request.query.type;
    if (request.query.category) where.category = request.query.category;
    const transactions = await app.prisma.transaction.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      include: {
        account: { select: { id: true, name: true, currency: true } },
        destinationAccount: { select: { id: true, name: true } }
      }
    });
    return {
      transactions: transactions.map((item) => ({ ...item, amount: asNumber(item.amount), roundUpAmount: asNumber(item.roundUpAmount) })),
      nextCursor: transactions.length === limit ? transactions.at(-1)?.id || null : null
    };
  });

  app.get('/category-suggestion', {
    preHandler: [app.authenticate],
    schema: { querystring: { type: 'object', required: ['description'], properties: { description: { type: 'string', minLength: 1, maxLength: 250 }, merchant: { type: 'string', maxLength: 120 } } } }
  }, async (request) => {
    const result = suggestCategory(`${request.query.merchant || ''} ${request.query.description}`);
    return { ...result, method: 'rules' };
  });

  app.post('/', { preHandler: [app.authenticate], schema: createSchema, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const transaction = await app.prisma.$transaction((tx) => recordTransaction(tx, {
      ...request.body,
      userId: request.user.sub,
      description: request.body.description.trim()
    }), { isolationLevel: 'Serializable' });
    return reply.code(201).send({ transaction: {
      ...transaction,
      amount: asNumber(transaction.amount),
      roundUpAmount: asNumber(transaction.roundUpAmount)
    } });
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request) => {
    const transaction = await app.prisma.transaction.findFirst({
      where: { id: request.params.id, userId: request.user.sub },
      include: { account: { select: { id: true, name: true } }, destinationAccount: { select: { id: true, name: true } } }
    });
    if (!transaction) throw new AppError(404, 'Transaction not found.', 'TRANSACTION_NOT_FOUND');
    return { transaction: { ...transaction, amount: asNumber(transaction.amount), roundUpAmount: asNumber(transaction.roundUpAmount) } };
  });
}
