import { AppError } from '../lib/http-errors.js';
import { asNumber } from '../lib/money.js';

function serializeAccount(account) {
  return {
    ...account,
    balance: asNumber(account.balance),
    availableBalance: asNumber(account.availableBalance)
  };
}

export async function accountRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const accounts = await app.prisma.account.findMany({
      where: { userId: request.user.sub, isArchived: false },
      include: { bankConnection: { select: { id: true, provider: true, institutionName: true, status: true, lastSyncedAt: true } } },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }]
    });
    return { accounts: accounts.map(serializeAccount) };
  });

  app.patch('/:id/round-ups', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } },
      body: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } }
    }
  }, async (request) => {
    const account = await app.prisma.account.findFirst({ where: { id: request.params.id, userId: request.user.sub, isArchived: false } });
    if (!account) throw new AppError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');
    if (request.body.enabled) {
      if (account.accountType !== 'CHECKING') throw new AppError(400, 'Round-ups can only be enabled on checking accounts.', 'ROUNDUP_ACCOUNT_TYPE_UNSUPPORTED');
      if (account.currency !== 'EUR') throw new AppError(400, 'Round-ups are currently available for EUR accounts only.', 'ROUNDUP_CURRENCY_UNSUPPORTED');
      const savings = await app.prisma.account.findFirst({
        where: { userId: request.user.sub, accountType: 'SAVINGS', currency: 'EUR', isArchived: false, id: { not: account.id } }
      });
      if (!savings) throw new AppError(409, 'Add an EUR savings account before enabling round-ups.', 'SAVINGS_ACCOUNT_REQUIRED');
    }
    const updated = await app.prisma.account.update({ where: { id: account.id }, data: { roundUpsEnabled: request.body.enabled } });
    return { account: serializeAccount(updated) };
  });
}
