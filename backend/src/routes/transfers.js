import { executeTransfer } from '../services/transactions.js';
import { asNumber } from '../lib/money.js';

export async function transferRoutes(app) {
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['sourceAccountId', 'destinationAccountId', 'amount'],
        properties: {
          sourceAccountId: { type: 'string', minLength: 1 },
          destinationAccountId: { type: 'string', minLength: 1 },
          amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
          description: { type: 'string', maxLength: 180 }
        }
      }
    },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const transaction = await executeTransfer(app.prisma, { ...request.body, userId: request.user.sub });
    return reply.code(201).send({ transaction: { ...transaction, amount: asNumber(transaction.amount) } });
  });
}
