import { describe, expect, it, vi } from 'vitest';
import { executeTransfer, recordTransaction } from './transactions.js';

function makeTransactionClient({ sourceBalance = 100, savingsBalance = 20, destinationBalance = 10, debitCount = 1 } = {}) {
  const checking = { id: 'checking-1', userId: 'user-1', name: 'Everyday account', accountType: 'CHECKING', currency: 'EUR', roundUpsEnabled: true, balance: sourceBalance, availableBalance: sourceBalance, isArchived: false };
  const savings = { id: 'savings-1', userId: 'user-1', name: 'Savings', accountType: 'SAVINGS', currency: 'EUR', roundUpsEnabled: false, balance: savingsBalance, availableBalance: savingsBalance, isArchived: false };
  const destination = { id: 'destination-1', userId: 'user-1', name: 'Travel account', accountType: 'SAVINGS', currency: 'EUR', roundUpsEnabled: false, balance: destinationBalance, availableBalance: destinationBalance, isArchived: false };
  const account = {
    findFirst: vi.fn(async ({ where }) => {
      if (where.accountType === 'SAVINGS') return savings;
      if (where.id === checking.id) return checking;
      if (where.id === destination.id) return destination;
      return null;
    }),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    updateMany: vi.fn(async () => ({ count: debitCount }))
  };
  const transaction = { create: vi.fn(async ({ data, include }) => ({ id: `transaction-${transaction.create.mock.calls.length}`, ...data, ...(include ? { account: { id: data.accountId, name: 'Everyday account' }, destinationAccount: { id: data.destinationAccountId, name: 'Travel account' } } : {}) })) };
  return { client: { account, transaction }, checking, savings, destination };
}

describe('transaction accounting services', () => {
  it('transfers an enabled EUR round-up to savings in the same atomic unit of work', async () => {
    const { client, checking, savings } = makeTransactionClient();
    const transaction = await recordTransaction(client, {
      userId: 'user-1', accountId: checking.id, type: 'EXPENSE', amount: 3.2,
      description: 'Corner Coffee', merchant: 'Corner Coffee'
    });
    expect(transaction.amount).toBe(3.2);
    expect(transaction.roundUpAmount).toBe(0.8);
    expect(client.account.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: checking.id }, data: { balance: { decrement: 4 }, availableBalance: { decrement: 4 } }
    }));
    expect(client.account.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: savings.id }, data: { balance: { increment: 0.8 }, availableBalance: { increment: 0.8 } }
    }));
    expect(client.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('rejects transfers that would overdraw the source account', async () => {
    const { client } = makeTransactionClient({ debitCount: 0 });
    const prisma = { ...client, $transaction: vi.fn(async (operation) => operation(client)) };
    await expect(executeTransfer(prisma, {
      userId: 'user-1', sourceAccountId: 'checking-1', destinationAccountId: 'destination-1', amount: 101
    })).rejects.toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_FUNDS' });
    expect(client.account.update).not.toHaveBeenCalled();
  });

  it('rejects transfers between different currencies', async () => {
    const { client, checking, destination } = makeTransactionClient();
    destination.currency = 'USD';
    const prisma = { ...client, $transaction: vi.fn(async (operation) => operation(client)) };
    await expect(executeTransfer(prisma, {
      userId: 'user-1', sourceAccountId: checking.id, destinationAccountId: destination.id, amount: 10
    })).rejects.toMatchObject({ statusCode: 400, code: 'CURRENCY_MISMATCH' });
    expect(client.transaction.create).not.toHaveBeenCalled();
  });
});
