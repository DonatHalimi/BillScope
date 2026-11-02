import { AppError } from '../lib/http-errors.js';
import { detectRecurringPayments, reviewSubscription, saveClassificationFeedback } from '../services/recurring-detection.js';
import { classifyUncategorisedTransactions, classifyOneTransaction } from '../services/transaction-nlp.js';

const categorySchema = { type: 'string', minLength: 1, maxLength: 60 };

export async function recurringRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const candidates = await app.prisma.subscriptionCandidate.findMany({
      where: { userId: request.user.sub },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { nextExpectedAt: 'asc' }],
      take: 200
    });
    return {
      candidates: candidates.map((item) => ({
        ...item,
        averageAmount: item.averageAmount.toString(),
        confidence: Number(item.confidence),
        sampleTransactionIds: Array.isArray(item.sampleTransactionIds) ? item.sampleTransactionIds : []
      }))
    };
  });

  app.post('/detect', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const classification = await classifyUncategorisedTransactions(app, request.user.sub);
    const candidates = await detectRecurringPayments(app, request.user.sub, { classify: false });
    return reply.code(200).send({ detected: candidates.length, classification, candidates: candidates.map((item) => ({ ...item, averageAmount: item.averageAmount.toString(), confidence: Number(item.confidence) })) });
  });

  app.post('/classify-preview', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['transactionId'], properties: { transactionId: { type: 'string', minLength: 1, maxLength: 80 } } } },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request) => classifyOneTransaction(app, request.user.sub, request.body));

  app.patch('/:id/review', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 80 } } },
      body: {
        type: 'object', additionalProperties: false, required: ['status'],
        properties: { status: { type: 'string', enum: ['CONFIRMED', 'DISMISSED'] }, category: categorySchema }
      }
    },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request) => reviewSubscription(app, request.user.sub, request.params.id, request.body));

  app.post('/feedback', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['transactionId', 'correctedCategory'],
        properties: {
          transactionId: { type: 'string', minLength: 1, maxLength: 80 },
          predictedCategory: categorySchema,
          correctedCategory: categorySchema
        }
      }
    }
  }, async (request, reply) => {
    const result = await saveClassificationFeedback(app, request.user.sub, request.body);
    return reply.code(200).send(result);
  });
}
