import { AppError } from '../lib/http-errors.js';
import { getProviderAdapter } from '../providers/registry.js';
import { recordTransaction } from '../services/transactions.js';
import { asNumber, SUPPORTED_CURRENCIES } from '../lib/money.js';

const connectSchema = {
  body: {
    type: 'object', additionalProperties: false,
    required: ['institutionId', 'currency'],
    properties: {
      institutionId: { type: 'string', minLength: 1 },
      currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
      accountName: { type: 'string', minLength: 1, maxLength: 80 }
    }
  }
};

export async function providerRoutes(app) {
  app.get('/institutions', { preHandler: [app.authenticate] }, async () => ({ institutions: getProviderAdapter('mock').listInstitutions() }));

  app.get('/connections', { preHandler: [app.authenticate] }, async (request) => {
    const connections = await app.prisma.bankConnection.findMany({
      where: { userId: request.user.sub },
      include: { accounts: { where: { isArchived: false }, select: { id: true, name: true, currency: true, balance: true, accountType: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return { connections: connections.map((connection) => ({
      ...connection,
      accounts: connection.accounts.map((account) => ({ ...account, balance: asNumber(account.balance) }))
    })) };
  });

  app.post('/connect', { preHandler: [app.authenticate], schema: connectSchema, config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const adapter = getProviderAdapter('mock');
    const supportedInstitution = adapter.listInstitutions().find((item) => item.id === request.body.institutionId);
    if (!supportedInstitution || !supportedInstitution.currencies.includes(request.body.currency)) {
      throw new AppError(400, 'Choose a supported institution and currency.', 'INSTITUTION_CURRENCY_UNSUPPORTED');
    }
    const remote = await adapter.connect({ userId: request.user.sub, institutionId: request.body.institutionId, currency: request.body.currency });
    if (!remote) throw new AppError(400, 'Institution is not available.', 'INSTITUTION_UNAVAILABLE');

    const { currency: accountCurrency, ...connectionData } = remote;
    const created = await app.prisma.$transaction(async (tx) => {
      const connection = await tx.bankConnection.create({ data: { ...connectionData, userId: request.user.sub } });
      const account = await tx.account.create({
        data: {
          userId: request.user.sub,
          bankConnectionId: connection.id,
          name: request.body.accountName?.trim() || `${remote.institutionName} account`,
          institutionName: remote.institutionName,
          accountType: 'CHECKING',
          currency: accountCurrency,
          balance: 0,
          availableBalance: 0
        }
      });
      return { connection, account };
    });
    return reply.code(201).send({
      connection: created.connection,
      account: { ...created.account, balance: asNumber(created.account.balance), availableBalance: asNumber(created.account.availableBalance) }
    });
  });

  app.post('/connections/:id/sync', { preHandler: [app.authenticate], config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
    const connection = await app.prisma.bankConnection.findFirst({
      where: { id: request.params.id, userId: request.user.sub },
      include: { accounts: { where: { isArchived: false }, orderBy: { createdAt: 'asc' } } }
    });
    if (!connection || !connection.accounts.length) throw new AppError(404, 'Bank connection not found.', 'CONNECTION_NOT_FOUND');
    const account = connection.accounts[0];
    const adapter = getProviderAdapter(connection.provider);
    const feed = await adapter.pullTransactions({ connectionId: connection.id });
    let imported = 0;
    const transactions = [];

    for (const item of feed) {
      if (await app.prisma.transaction.findUnique({ where: { externalId: item.externalId } })) continue;
      try {
        const transaction = await app.prisma.$transaction((tx) => recordTransaction(tx, {
          userId: request.user.sub,
          accountId: account.id,
          type: item.type,
          amount: item.amount,
          description: item.description,
          merchant: item.merchant,
          category: item.category,
          occurredAt: item.occurredAt,
          externalId: item.externalId,
          source: 'mock-provider'
        }), { isolationLevel: 'Serializable' });
        imported += 1;
        transactions.push({ ...transaction, amount: asNumber(transaction.amount) });
      } catch (error) {
        if (error?.code !== 'P2002') throw error;
      }
    }

    const updatedConnection = await app.prisma.bankConnection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTED', lastSyncedAt: new Date() }
    });
    return reply.send({ connection: updatedConnection, imported, transactions });
  });
}
