import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http-errors.js';
import { notifyHousehold, requireHouseholdMember, requireHouseholdRole, withHouseholdTenant } from '../lib/household-tenant.js';
import { SUPPORTED_CURRENCIES } from '../services/fx.js';

const WRITE_BUDGET_ROLES = ['OWNER', 'ADMIN'];
const WRITE_EXPENSE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];
const TICKET_TTL_MS = 30000;

const createHouseholdSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['name'],
    properties: { name: { type: 'string', minLength: 2, maxLength: 80 }, currency: { type: 'string', enum: SUPPORTED_CURRENCIES } }
  }
};

function requireTrustedOrigin(request, app) {
  if (request.headers.origin !== app.config.frontendUrl) throw new AppError(403, 'Request origin verification failed.', 'ORIGIN_REJECTED');
}

function amountCents(value) {
  let amount;
  try { amount = new Prisma.Decimal(String(value)); }
  catch { throw new AppError(400, 'Expense amounts must be valid decimal numbers.', 'INVALID_EXPENSE_AMOUNT'); }
  if (!amount.isFinite() || amount.lte(0) || amount.gt('100000000') || amount.decimalPlaces() > 2) {
    throw new AppError(400, 'Expense amounts must be positive, use at most two decimal places, and not exceed 100,000,000.', 'INVALID_EXPENSE_AMOUNT');
  }
  return Number(amount.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString());
}

function distributeByWeights(totalCents, weights) {
  const totalWeight = weights.reduce((sum, item) => sum + item, 0);
  if (totalWeight <= 0) throw new AppError(400, 'Split weights must total more than zero.', 'INVALID_SPLIT');
  const shares = weights.map((weight) => {
    const exact = (totalCents * weight) / totalWeight;
    return { cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remainder = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);
  const order = shares.map((share, index) => ({ index, fraction: share.remainder })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) shares[order[index % order.length].index].cents += 1;
  return shares.map((share) => share.cents);
}

function computeSplitRows({ totalCents, splitMode, splits }) {
  if (!Array.isArray(splits) || splits.length < 1 || splits.length > 50) throw new AppError(400, 'Provide between 1 and 50 expense participants.', 'INVALID_SPLIT');
  const ids = splits.map((split) => split.memberUserId);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new AppError(400, 'Expense participants must be unique valid household member IDs.', 'INVALID_SPLIT');

  if (splitMode === 'EQUAL') {
    const values = distributeByWeights(totalCents, splits.map(() => 1));
    return splits.map((split, index) => ({ memberUserId: split.memberUserId, amount: new Prisma.Decimal(values[index]).div(100), sharePercent: new Prisma.Decimal(values[index] * 100 / totalCents).toDecimalPlaces(4) }));
  }
  if (splitMode === 'PERCENTAGE') {
    if (splits.some((split) => !Number.isFinite(Number(split.percentage)) || Number(split.percentage) < 0 || Number(split.percentage) > 100)) {
      throw new AppError(400, 'Each split percentage must be between 0 and 100.', 'INVALID_SPLIT');
    }
    const bps = splits.map((split) => Math.round(Number(split.percentage) * 100));
    if (bps.reduce((sum, value) => sum + value, 0) !== 10000) throw new AppError(400, 'Percent splits must add up to exactly 100%.', 'INVALID_SPLIT_TOTAL');
    const values = distributeByWeights(totalCents, bps);
    return splits.map((split, index) => ({ memberUserId: split.memberUserId, amount: new Prisma.Decimal(values[index]).div(100), sharePercent: new Prisma.Decimal(bps[index]).div(100) }));
  }
  if (splitMode === 'CUSTOM') {
    if (splits.some((split) => split.amount === undefined || split.amount === null || split.amount === '')) {
      throw new AppError(400, 'Every participant needs a custom split amount.', 'INVALID_SPLIT');
    }
    const values = splits.map((split) => amountCents(split.amount));
    if (values.reduce((sum, value) => sum + value, 0) !== totalCents) throw new AppError(400, 'Custom split amounts must equal the expense total exactly to the cent.', 'INVALID_SPLIT_TOTAL');
    return splits.map((split, index) => ({ memberUserId: split.memberUserId, amount: new Prisma.Decimal(values[index]).div(100), sharePercent: new Prisma.Decimal(values[index] * 100 / totalCents).toDecimalPlaces(4) }));
  }
  throw new AppError(400, 'Split mode must be EQUAL, PERCENTAGE, or CUSTOM.', 'INVALID_SPLIT_MODE');
}

function publicHousehold(household) {
  return {
    ...household,
    budgets: household.budgets?.map((budget) => ({ ...budget, amount: budget.amount.toString() })),
    expenses: household.expenses?.map((expense) => ({
      ...expense,
      amount: expense.amount.toString(),
      splits: expense.splits?.map((split) => ({ ...split, amount: split.amount.toString(), sharePercent: split.sharePercent?.toString() || null }))
    }))
  };
}

export async function householdRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const households = await withHouseholdTenant(app.prisma, request.user.sub, (tx) => tx.household.findMany({
      where: { members: { some: { userId: request.user.sub } } },
      include: {
        members: { select: { role: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        _count: { select: { budgets: true, expenses: true } }
      },
      orderBy: { createdAt: 'desc' }
    }));
    return { households };
  });

  app.post('/', { preHandler: [app.authenticate], schema: createHouseholdSchema, config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    requireTrustedOrigin(request, app);
    const name = request.body.name.trim();
    if (name.length < 2) throw new AppError(400, 'Household name must contain at least two characters.', 'INVALID_HOUSEHOLD_NAME');
    const household = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      const created = await tx.household.create({ data: { ownerId: request.user.sub, name, currency: request.body.currency || 'EUR' } });
      await tx.householdMember.create({ data: { householdId: created.id, userId: request.user.sub, role: 'OWNER' } });
      return created;
    });
    return reply.code(201).send({ household });
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request) => {
    return withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      await requireHouseholdMember(tx, request.params.id, request.user.sub);
      const household = await tx.household.findUnique({
        where: { id: request.params.id },
        include: {
          members: { select: { role: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'asc' } },
          budgets: { orderBy: { createdAt: 'desc' } },
          expenses: {
            take: 25,
            orderBy: { occurredAt: 'desc' },
            include: {
              splits: {
                include: {
                  householdMember: {
                    select: { role: true, user: { select: { id: true, firstName: true, lastName: true } } }
                  }
                }
              }
            }
          }
        }
      });
      if (!household) throw new AppError(404, 'Household not found.', 'HOUSEHOLD_NOT_FOUND');
      return { household: publicHousehold(household) };
    });
  });

  app.post('/:id/members', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['email', 'role'], properties: { email: { type: 'string', format: 'email', maxLength: 254 }, role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] } } } },
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const created = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      const actor = await requireHouseholdMember(tx, request.params.id, request.user.sub);
      requireHouseholdRole(actor, WRITE_BUDGET_ROLES);
      if (actor.role === 'ADMIN' && request.body.role === 'ADMIN') throw new AppError(403, 'Only the household owner can grant administrator access.', 'HOUSEHOLD_ROLE_GRANT_BLOCKED');
      const user = await tx.user.findUnique({ where: { email: request.body.email.trim().toLowerCase() }, select: { id: true, firstName: true, lastName: true, email: true } });
      if (!user || !user.id) throw new AppError(404, 'The invited user must have a BillScope account.', 'INVITED_USER_NOT_FOUND');
      const existing = await tx.householdMember.findUnique({ where: { householdId_userId: { householdId: request.params.id, userId: user.id } } });
      if (existing) throw new AppError(409, 'This user is already a member of the household.', 'HOUSEHOLD_MEMBER_EXISTS');
      return tx.householdMember.create({ data: { householdId: request.params.id, userId: user.id, role: request.body.role }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } });
    });
    notifyHousehold(app, request.params.id, 'member.added', { userId: created.userId, role: created.role });
    return reply.code(201).send({ member: created });
  });

  app.patch('/:id/members/:userId', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['role'], properties: { role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] } } } }
  }, async (request) => {
    const updated = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      const actor = await requireHouseholdMember(tx, request.params.id, request.user.sub);
      requireHouseholdRole(actor, WRITE_BUDGET_ROLES);
      if (actor.role === 'ADMIN' && request.body.role === 'ADMIN') throw new AppError(403, 'Only the household owner can grant administrator access.', 'HOUSEHOLD_ROLE_GRANT_BLOCKED');
      if (request.params.userId === request.user.sub) throw new AppError(400, 'You cannot change your own household role.', 'SELF_ROLE_CHANGE_BLOCKED');
      const target = await tx.householdMember.findUnique({ where: { householdId_userId: { householdId: request.params.id, userId: request.params.userId } } });
      if (!target || target.role === 'OWNER') throw new AppError(404, 'Household member not found.', 'HOUSEHOLD_MEMBER_NOT_FOUND');
      return tx.householdMember.update({ where: { id: target.id }, data: { role: request.body.role }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } });
    });
    notifyHousehold(app, request.params.id, 'member.role-changed', { userId: updated.userId, role: updated.role });
    return { member: updated };
  });

  app.get('/:id/budgets', { preHandler: [app.authenticate] }, async (request) => {
    const budgets = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      await requireHouseholdMember(tx, request.params.id, request.user.sub);
      return tx.householdBudget.findMany({ where: { householdId: request.params.id }, orderBy: { createdAt: 'desc' } });
    });
    return { budgets: budgets.map((item) => ({ ...item, amount: item.amount.toString() })) };
  });

  app.post('/:id/budgets', {
    preHandler: [app.authenticate],
    schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'amount'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, category: { type: 'string', maxLength: 60 }, amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 }, currency: { type: 'string', enum: SUPPORTED_CURRENCIES }, period: { type: 'string', enum: ['WEEKLY', 'MONTHLY'] } } } }
  }, async (request, reply) => {
    const budget = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      const actor = await requireHouseholdMember(tx, request.params.id, request.user.sub);
      requireHouseholdRole(actor, WRITE_BUDGET_ROLES);
      const household = await tx.household.findUnique({ where: { id: request.params.id }, select: { id: true, currency: true } });
      if (!household) throw new AppError(404, 'Household not found.', 'HOUSEHOLD_NOT_FOUND');
      const currency = request.body.currency || household.currency;
      if (currency !== household.currency) throw new AppError(400, 'Household budgets must use the household currency.', 'CURRENCY_MISMATCH');
      return tx.householdBudget.create({ data: {
        householdId: household.id,
        createdById: request.user.sub,
        name: request.body.name.trim(),
        category: request.body.category?.trim() || null,
        amount: new Prisma.Decimal(String(request.body.amount)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        currency,
        period: request.body.period || 'MONTHLY'
      } });
    });
    notifyHousehold(app, request.params.id, 'budget.created', { budgetId: budget.id });
    return reply.code(201).send({ budget: { ...budget, amount: budget.amount.toString() } });
  });

  app.get('/:id/expenses', { preHandler: [app.authenticate] }, async (request) => {
    const expenses = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      await requireHouseholdMember(tx, request.params.id, request.user.sub);
      return tx.householdExpense.findMany({
        where: { householdId: request.params.id },
        take: 100,
        orderBy: { occurredAt: 'desc' },
        include: {
          splits: {
            include: {
              householdMember: {
                select: { role: true, user: { select: { id: true, firstName: true, lastName: true } } }
              }
            }
          }
        }
      });
    });
    return { expenses: expenses.map((item) => publicHousehold({ expenses: [item] }).expenses[0]) };
  });

  app.post('/:id/expenses', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['description', 'amount', 'splitMode', 'splits'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 180 },
          amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 },
          budgetId: { type: 'string', minLength: 1, maxLength: 80 },
          occurredAt: { type: 'string', format: 'date-time' },
          splitMode: { type: 'string', enum: ['EQUAL', 'PERCENTAGE', 'CUSTOM'] },
          splits: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['memberUserId'], properties: { memberUserId: { type: 'string', minLength: 1, maxLength: 80 }, percentage: { type: 'number', minimum: 0, maximum: 100 }, amount: { type: 'number', exclusiveMinimum: 0, maximum: 100000000 } } } }
        }
      }
    }
  }, async (request, reply) => {
    const expense = await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      const actor = await requireHouseholdMember(tx, request.params.id, request.user.sub);
      requireHouseholdRole(actor, WRITE_EXPENSE_ROLES);
      const household = await tx.household.findUnique({ where: { id: request.params.id }, select: { id: true, currency: true } });
      if (!household) throw new AppError(404, 'Household not found.', 'HOUSEHOLD_NOT_FOUND');
      const totalCents = amountCents(request.body.amount);
      const splitRows = computeSplitRows({ totalCents, splitMode: request.body.splitMode, splits: request.body.splits });
      const participants = await tx.householdMember.findMany({ where: { householdId: household.id, userId: { in: splitRows.map((split) => split.memberUserId) } }, select: { userId: true } });
      if (participants.length !== splitRows.length) throw new AppError(400, 'Every split participant must be an active member of this household.', 'INVALID_HOUSEHOLD_PARTICIPANT');
      if (request.body.budgetId) {
        const budget = await tx.householdBudget.findFirst({ where: { id: request.body.budgetId, householdId: household.id }, select: { id: true, currency: true } });
        if (!budget) throw new AppError(404, 'Household budget not found.', 'HOUSEHOLD_BUDGET_NOT_FOUND');
        if (budget.currency !== household.currency) throw new AppError(400, 'Expense currency does not match the selected budget.', 'CURRENCY_MISMATCH');
      }
      return tx.householdExpense.create({
        data: {
          householdId: household.id,
          budgetId: request.body.budgetId || null,
          createdById: request.user.sub,
          description: request.body.description.trim(),
          amount: new Prisma.Decimal(totalCents).div(100),
          currency: household.currency,
          splitMode: request.body.splitMode,
          occurredAt: request.body.occurredAt ? new Date(request.body.occurredAt) : new Date(),
          splits: { create: splitRows.map((split) => ({ householdId: household.id, memberUserId: split.memberUserId, amount: split.amount, sharePercent: split.sharePercent })) }
        },
        include: {
          splits: {
            include: {
              householdMember: {
                select: { role: true, user: { select: { id: true, firstName: true, lastName: true } } }
              }
            }
          }
        }
      });
    });
    notifyHousehold(app, request.params.id, 'expense.created', { expenseId: expense.id, amount: expense.amount.toString(), currency: expense.currency });
    return reply.code(201).send({ expense: publicHousehold({ expenses: [expense] }).expenses[0] });
  });

  app.post('/:id/socket-ticket', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    requireTrustedOrigin(request, app);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    await withHouseholdTenant(app.prisma, request.user.sub, async (tx) => {
      await requireHouseholdMember(tx, request.params.id, request.user.sub);
      await tx.householdSocketTicket.create({ data: { tokenHash, householdId: request.params.id, userId: request.user.sub, expiresAt } });
    });
    reply.header('Cache-Control', 'no-store');
    return { ticket: token, expiresAt };
  });

  app.get('/:id/live', {
    websocket: true,
    schema: { querystring: { type: 'object', additionalProperties: false, required: ['ticket'], properties: { ticket: { type: 'string', minLength: 40, maxLength: 100 } } } },
    preHandler: async (request) => {
      if (request.headers.origin !== app.config.frontendUrl) throw new AppError(403, 'WebSocket origin rejected.', 'ORIGIN_REJECTED');
      const tokenHash = createHash('sha256').update(request.query.ticket).digest('hex');
      const consumed = await app.prisma.householdSocketTicket.updateMany({ where: { tokenHash, householdId: request.params.id, expiresAt: { gt: new Date() }, consumedAt: null }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new AppError(401, 'WebSocket ticket is invalid, expired, or already used.', 'SOCKET_TICKET_INVALID');
      const ticket = await app.prisma.householdSocketTicket.findUnique({ where: { tokenHash }, select: { userId: true, householdId: true } });
      if (!ticket || ticket.householdId !== request.params.id) throw new AppError(401, 'WebSocket ticket is invalid.', 'SOCKET_TICKET_INVALID');
      await withHouseholdTenant(app.prisma, ticket.userId, async (tx) => requireHouseholdMember(tx, request.params.id, ticket.userId));
      request.householdSocketContext = ticket;
    }
  }, (socket, request) => {
    const householdId = request.householdSocketContext.householdId;
    if (!app.householdSockets.has(householdId)) app.householdSockets.set(householdId, new Set());
    const clients = app.householdSockets.get(householdId);
    clients.add(socket);
    socket.send(JSON.stringify({ type: 'household.connected', householdId, sentAt: new Date().toISOString() }));
    socket.on('message', () => socket.close(1008, 'Client messages are not supported.'));
    socket.on('close', () => {
      clients.delete(socket);
      if (!clients.size) app.householdSockets.delete(householdId);
    });
    socket.on('error', () => {
      clients.delete(socket);
      if (!clients.size) app.householdSockets.delete(householdId);
    });
  });
}
