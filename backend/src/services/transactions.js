import { suggestCategory } from '../lib/categorize.js';
import { asNumber, roundUpAmount, toCents, fromCents } from '../lib/money.js';
import { AppError } from '../lib/http-errors.js';

export async function recordTransaction(tx, { userId, accountId, type, amount, description, merchant, category, occurredAt, externalId, source = 'manual' }) {
  const cents = toCents(amount);
  if (cents <= 0) throw new AppError(400, 'Transaction amount must be greater than zero.', 'INVALID_AMOUNT');
  if (!['INCOME', 'EXPENSE'].includes(type)) throw new AppError(400, 'Use the transfer endpoint for transfers.', 'INVALID_TRANSACTION_TYPE');

  const account = await tx.account.findFirst({ where: { id: accountId, userId, isArchived: false } });
  if (!account) throw new AppError(404, 'Account not found.', 'ACCOUNT_NOT_FOUND');

  const roundedAmount = fromCents(cents);
  const cleanDescription = String(description || '').trim();
  if (!cleanDescription) throw new AppError(400, 'Transaction description is required.', 'DESCRIPTION_REQUIRED');
  const inferredCategory = category?.trim() || suggestCategory(`${merchant || ''} ${cleanDescription}`).category;
  let roundUp = 0;
  let savingsAccount = null;
  if (type === 'EXPENSE' && account.roundUpsEnabled && account.currency === 'EUR') {
    savingsAccount = await tx.account.findFirst({
      where: { userId, accountType: 'SAVINGS', currency: 'EUR', isArchived: false, id: { not: account.id } },
      orderBy: { createdAt: 'asc' }
    });
    if (savingsAccount) roundUp = roundUpAmount(roundedAmount);
  }

  await tx.account.update({
    where: { id: account.id },
    data: type === 'EXPENSE'
      ? { balance: { decrement: roundedAmount + roundUp }, availableBalance: { decrement: roundedAmount + roundUp } }
      : { balance: { increment: roundedAmount }, availableBalance: { increment: roundedAmount } }
  });

  const transaction = await tx.transaction.create({
    data: {
      userId,
      accountId: account.id,
      type,
      status: 'POSTED',
      description: cleanDescription,
      merchant: merchant?.trim() || null,
      category: inferredCategory,
      amount: roundedAmount,
      roundUpAmount: roundUp,
      currency: account.currency,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      externalId: externalId || null,
      source
    },
    include: { account: { select: { id: true, name: true, currency: true } } }
  });

  if (savingsAccount && roundUp > 0) {
    await tx.account.update({
      where: { id: savingsAccount.id },
      data: { balance: { increment: roundUp }, availableBalance: { increment: roundUp } }
    });
    await tx.transaction.create({
      data: {
        userId,
        accountId: account.id,
        destinationAccountId: savingsAccount.id,
        type: 'TRANSFER',
        status: 'POSTED',
        description: `Round-up savings · ${description.trim()}`,
        category: 'Savings',
        amount: roundUp,
        currency: 'EUR',
        occurredAt: transaction.occurredAt,
        source: 'round-up'
      }
    });
  }
  return transaction;
}

export async function executeTransfer(prisma, { userId, sourceAccountId, destinationAccountId, amount, description }) {
  const cents = toCents(amount);
  if (cents <= 0) throw new AppError(400, 'Transfer amount must be greater than zero.', 'INVALID_AMOUNT');
  if (sourceAccountId === destinationAccountId) throw new AppError(400, 'Choose two different accounts.', 'SAME_ACCOUNT');
  const amountValue = fromCents(cents);

  return prisma.$transaction(async (tx) => {
    const [source, destination] = await Promise.all([
      tx.account.findFirst({ where: { id: sourceAccountId, userId, isArchived: false } }),
      tx.account.findFirst({ where: { id: destinationAccountId, userId, isArchived: false } })
    ]);
    if (!source || !destination) throw new AppError(404, 'One or both accounts could not be found.', 'ACCOUNT_NOT_FOUND');
    if (source.currency !== destination.currency) throw new AppError(400, 'Transfers must use accounts with the same currency.', 'CURRENCY_MISMATCH');

    const debited = await tx.account.updateMany({
      where: { id: source.id, userId, balance: { gte: amountValue } },
      data: { balance: { decrement: amountValue }, availableBalance: { decrement: amountValue } }
    });
    if (debited.count !== 1) throw new AppError(409, 'Insufficient available balance for this transfer.', 'INSUFFICIENT_FUNDS');
    await tx.account.update({
      where: { id: destination.id },
      data: { balance: { increment: amountValue }, availableBalance: { increment: amountValue } }
    });

    const record = await tx.transaction.create({
      data: {
        userId,
        accountId: source.id,
        destinationAccountId: destination.id,
        type: 'TRANSFER',
        status: 'POSTED',
        description: description?.trim() || `Transfer to ${destination.name}`,
        category: 'Transfers',
        amount: amountValue,
        currency: source.currency,
        source: 'local-transfer'
      },
      include: {
        account: { select: { id: true, name: true } },
        destinationAccount: { select: { id: true, name: true } }
      }
    });
    return record;
  }, { isolationLevel: 'Serializable' });
}
