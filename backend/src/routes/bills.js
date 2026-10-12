import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/http-errors.js';
import { asNumber } from '../lib/money.js';

const createSchema = {
  body: {
    type: 'object', additionalProperties: false,
    required: ['title', 'amount', 'dueDate'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 100 },
      amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
      currency: { type: 'string', enum: ['EUR', 'USD', 'GBP', 'JPY', 'CHF'] },
      category: { type: 'string', maxLength: 60 },
      dueDate: { type: 'string', format: 'date-time' },
      recurringPeriod: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] },
      autoPay: { type: 'boolean' },
      accountId: { type: 'string' }
    }
  }
};

export async function billRoutes(app) {
  app.get('/', {
    preHandler: [app.authenticate],
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['UPCOMING', 'PAID', 'OVERDUE'] }
        }
      }
    }
  }, async (request) => {
    const where = { userId: request.user.sub };
    if (request.query.from || request.query.to) {
      where.dueDate = {};
      if (request.query.from) where.dueDate.gte = new Date(request.query.from);
      if (request.query.to) where.dueDate.lte = new Date(request.query.to);
    }
    if (request.query.status && ['UPCOMING', 'PAID', 'OVERDUE'].includes(request.query.status)) where.status = request.query.status;
    const bills = await app.prisma.bill.findMany({ where, orderBy: [{ dueDate: 'asc' }, { title: 'asc' }] });
    return { bills: bills.map((bill) => ({ ...bill, amount: asNumber(bill.amount) })) };
  });

  app.post('/', { preHandler: [app.authenticate], schema: createSchema }, async (request, reply) => {
    const body = request.body;
    const title = body.title.trim();
    if (!title) throw new AppError(400, 'Bill title is required.', 'BILL_TITLE_REQUIRED');
    if (body.accountId) {
      const account = await app.prisma.account.findFirst({ where: { id: body.accountId, userId: request.user.sub, isArchived: false } });
      if (!account) throw new AppError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
      if (body.currency && body.currency !== account.currency) throw new AppError(400, 'Bill currency must match the selected account.', 'CURRENCY_MISMATCH');
    }
    const firstDueDate = new Date(body.dueDate);
    const baseData = {
      userId: request.user.sub,
      title,
      amount: body.amount,
      currency: body.currency || 'EUR',
      category: body.category?.trim() || 'Bills',
      recurringPeriod: body.recurringPeriod || null,
      autoPay: body.autoPay === true,
      accountId: body.accountId || null
    };
    let bill;
    let occurrencesCreated = 1;
    if (!body.recurringPeriod) {
      bill = await app.prisma.bill.create({ data: { ...baseData, dueDate: firstDueDate } });
    } else {
      const recurrenceGroupId = randomUUID();
      const horizon = new Date(firstDueDate);
      horizon.setFullYear(horizon.getFullYear() + 1);
      const occurrences = [];
      let occurrence = 0;
      let nextDate = firstDueDate;
      while (nextDate < horizon && occurrences.length < 54) {
        occurrences.push(new Date(nextDate));
        occurrence += 1;
        nextDate = addOccurrence(firstDueDate, body.recurringPeriod, occurrence);
      }
      occurrencesCreated = occurrences.length;
      const createdBills = await app.prisma.$transaction(async (tx) => {
        const output = [];
        for (const dueDate of occurrences) {
          output.push(await tx.bill.create({ data: { ...baseData, dueDate, recurrenceGroupId } }));
        }
        return output;
      }, { isolationLevel: 'Serializable' });
      bill = createdBills[0];
    }
    return reply.code(201).send({ bill: { ...bill, amount: asNumber(bill.amount) }, occurrencesCreated });
  });

  app.patch('/:id/status', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', enum: ['UPCOMING', 'PAID', 'OVERDUE'] } } } }
  }, async (request) => {
    const owned = await app.prisma.bill.findFirst({ where: { id: request.params.id, userId: request.user.sub }, select: { id: true } });
    if (!owned) throw new AppError(404, 'Bill not found.', 'BILL_NOT_FOUND');
    const bill = await app.prisma.bill.update({ where: { id: owned.id }, data: { status: request.body.status } });
    return { bill: { ...bill, amount: asNumber(bill.amount) } };
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const deleted = await app.prisma.bill.deleteMany({ where: { id: request.params.id, userId: request.user.sub } });
    if (!deleted.count) throw new AppError(404, 'Bill not found.', 'BILL_NOT_FOUND');
    return reply.code(204).send();
  });
}


function addOccurrence(value, period, occurrence = 1) {
  const date = new Date(value);
  if (period === 'WEEKLY') {
    date.setDate(date.getDate() + (7 * occurrence));
    return date;
  }
  const originalDay = date.getDate();
  const monthsPerOccurrence = period === 'MONTHLY' ? 1 : period === 'QUARTERLY' ? 3 : 12;
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + (monthsPerOccurrence * occurrence), 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(originalDay, lastDay));
  return targetMonth;
}
