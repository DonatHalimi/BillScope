import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http-errors.js';
import { classifyUncategorisedTransactions, classifyTransactionText, normalizeMerchantKey } from './transaction-nlp.js';

const DAY_MS = 86400000;
const LOOKBACK_DAYS = 400;
const MAX_TRANSACTIONS = 2500;

function normalizedMerchant(transaction) {
  return normalizeMerchantKey(transaction.merchant || transaction.description || 'Unknown merchant');
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function cadenceFor(intervalDays) {
  if (intervalDays >= 5 && intervalDays <= 9) return { cadence: 'WEEKLY', expectedDays: 7, tolerance: 2.5 };
  if (intervalDays >= 12 && intervalDays <= 17) return { cadence: 'BIWEEKLY', expectedDays: 14, tolerance: 3 };
  if (intervalDays >= 25 && intervalDays <= 35) return { cadence: 'MONTHLY', expectedDays: 30.4375, tolerance: 5 };
  if (intervalDays >= 80 && intervalDays <= 105) return { cadence: 'QUARTERLY', expectedDays: 91.3125, tolerance: 12 };
  if (intervalDays >= 350 && intervalDays <= 380) return { cadence: 'YEARLY', expectedDays: 365.25, tolerance: 15 };
  return null;
}

function analyseGroup(transactions) {
  if (transactions.length < 2) return null;
  const chronological = [...transactions].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  const intervals = [];
  for (let index = 1; index < chronological.length; index += 1) {
    intervals.push((new Date(chronological[index].occurredAt) - new Date(chronological[index - 1].occurredAt)) / DAY_MS);
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(sortedIntervals.length / 2);
  const medianInterval = sortedIntervals.length % 2 ? sortedIntervals[middle] : (sortedIntervals[middle - 1] + sortedIntervals[middle]) / 2;
  const cadence = cadenceFor(medianInterval);
  if (!cadence) return null;
  const intervalConsistency = intervals.filter((value) => Math.abs(value - cadence.expectedDays) <= cadence.tolerance).length / intervals.length;
  const amounts = chronological.map((item) => Math.abs(Number(item.amount)));
  const meanAmount = average(amounts);
  const amountVariation = meanAmount > 0 ? Math.sqrt(average(amounts.map((value) => (value - meanAmount) ** 2))) / meanAmount : 1;
  const amountConsistency = Math.max(0, Math.min(1, 1 - amountVariation));
  const recurrenceEvidence = Math.min(1, chronological.length / 5);
  const confidence = Math.round((0.42 * intervalConsistency + 0.33 * amountConsistency + 0.25 * recurrenceEvidence) * 10000) / 10000;
  if (confidence < 0.48) return null;
  const last = chronological.at(-1);
  const first = chronological[0];
  const nextExpectedAt = new Date(new Date(last.occurredAt).getTime() + cadence.expectedDays * DAY_MS);
  const displayName = (last.merchant || last.description || 'Recurring payment').trim().slice(0, 100);
  const averageAmount = new Prisma.Decimal(amounts.reduce((sum, value) => sum + value, 0)).div(amounts.length).toDecimalPlaces(2);
  return {
    merchantKey: normalizedMerchant(last),
    displayName,
    averageAmount,
    transactionCount: chronological.length,
    currency: last.currency,
    cadence: cadence.cadence,
    confidence,
    nextExpectedAt,
    firstSeenAt: new Date(first.occurredAt),
    lastSeenAt: new Date(last.occurredAt),
    sampleTransactionIds: chronological.slice(-12).map((item) => item.id),
    category: last.category && last.category !== 'Uncategorised' ? last.category : 'Subscriptions'
  };
}

export async function detectRecurringPayments(app, userId, { classify = true } = {}) {
  if (classify) await classifyUncategorisedTransactions(app, userId);
  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const transactions = await app.prisma.transaction.findMany({
    where: { userId, type: 'EXPENSE', status: 'POSTED', occurredAt: { gte: since } },
    select: { id: true, description: true, merchant: true, amount: true, currency: true, category: true, occurredAt: true },
    orderBy: { occurredAt: 'asc' },
    take: MAX_TRANSACTIONS
  });
  const groups = new Map();
  for (const transaction of transactions) {
    const merchantKey = normalizedMerchant(transaction);
    const key = `${merchantKey}\u0000${transaction.currency}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(transaction);
  }

  const candidatesToSave = [...groups.values()].map(analyseGroup).filter(Boolean);
  const candidates = new Array(candidatesToSave.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, candidatesToSave.length) }, async () => {
    while (cursor < candidatesToSave.length) {
      const index = cursor++;
      const candidate = candidatesToSave[index];
      candidates[index] = await app.prisma.subscriptionCandidate.upsert({
        where: { userId_merchantKey_currency_cadence: { userId, merchantKey: candidate.merchantKey, currency: candidate.currency, cadence: candidate.cadence } },
        create: { ...candidate, userId },
        update: {
          displayName: candidate.displayName,
          averageAmount: candidate.averageAmount,
          transactionCount: candidate.transactionCount,
          confidence: candidate.confidence,
          nextExpectedAt: candidate.nextExpectedAt,
          firstSeenAt: candidate.firstSeenAt,
          lastSeenAt: candidate.lastSeenAt,
          sampleTransactionIds: candidate.sampleTransactionIds
        }
      });
    }
  });
  await Promise.all(workers);
  return candidates.sort((a, b) => Number(b.confidence) - Number(a.confidence));
}

export async function reviewSubscription(app, userId, candidateId, { status, category }) {
  if (!['CONFIRMED', 'DISMISSED'].includes(status)) throw new AppError(400, 'Review status must be CONFIRMED or DISMISSED.', 'INVALID_REVIEW_STATUS');
  const recurrenceGroupId = `subscription:${candidateId}`;
  const updated = await app.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(642378301)`;
    const candidate = await tx.subscriptionCandidate.findFirst({ where: { id: candidateId, userId } });
    if (!candidate) throw new AppError(404, 'Recurring payment candidate not found.', 'SUBSCRIPTION_NOT_FOUND');
    const updatedCandidate = await tx.subscriptionCandidate.update({
      where: { id: candidate.id },
      data: { status, reviewedAt: new Date(), ...(category ? { category, userCorrected: true } : {}) }
    });
    if (status === 'DISMISSED') return { candidate: updatedCandidate, billsCreated: 0 };
    const existingBill = await tx.bill.findFirst({ where: { userId, recurrenceGroupId }, select: { id: true } });
    if (existingBill) return { candidate: updatedCandidate, billsCreated: 0 };

    const period = candidate.cadence;
    const dueDate = candidate.nextExpectedAt && candidate.nextExpectedAt > new Date() ? candidate.nextExpectedAt : new Date(Date.now() + 7 * DAY_MS);
    const horizon = new Date(dueDate);
    horizon.setFullYear(horizon.getFullYear() + 1);
    const dates = [];
    const next = (date, index) => {
      const value = new Date(date);
      if (period === 'WEEKLY' || period === 'BIWEEKLY') value.setDate(value.getDate() + (period === 'BIWEEKLY' ? 14 : 7) * index);
      else {
        const months = period === 'MONTHLY' ? 1 : period === 'QUARTERLY' ? 3 : 12;
        const originalDay = value.getDate();
        const target = new Date(value.getFullYear(), value.getMonth() + months * index, 1, value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
        target.setDate(Math.min(originalDay, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
        return target;
      }
      return value;
    };
    for (let index = 0; index < 54; index += 1) {
      const date = next(dueDate, index);
      if (date >= horizon) break;
      dates.push(date);
    }
    const createdBills = await tx.bill.createMany({ skipDuplicates: true, data: dates.map((date) => ({
      userId,
      title: updatedCandidate.displayName,
      amount: updatedCandidate.averageAmount,
      currency: updatedCandidate.currency,
      category: category || updatedCandidate.category || 'Subscriptions',
      dueDate: date,
      status: 'UPCOMING',
      recurringPeriod: period,
      recurrenceGroupId,
      autoPay: false,
      createdAt: new Date(),
      updatedAt: new Date()
    })) });
    return { candidate: updatedCandidate, billsCreated: createdBills.count };
  }, { isolationLevel: 'ReadCommitted' });
  return updated;
}

export async function saveClassificationFeedback(app, userId, payload) {
  const transaction = await app.prisma.transaction.findFirst({ where: { id: payload.transactionId, userId }, select: { id: true, category: true, merchant: true, description: true } });
  if (!transaction) throw new AppError(404, 'Transaction not found.', 'TRANSACTION_NOT_FOUND');
  const correctedCategory = payload.correctedCategory.trim().slice(0, 60);
  if (!correctedCategory) throw new AppError(400, 'Category cannot be blank.', 'INVALID_CATEGORY');
  const normalizedMerchantKey = normalizedMerchant(transaction);
  const predictedCategory = (payload.predictedCategory || (transaction.category && transaction.category !== 'Uncategorised' ? transaction.category : classifyTransactionText(transaction).category) || 'Uncategorised').trim().slice(0, 60);
  const result = await app.prisma.$transaction(async (tx) => {
    const feedback = await tx.transactionClassificationFeedback.upsert({
      where: { userId_transactionId: { userId, transactionId: transaction.id } },
      create: { userId, transactionId: transaction.id, predictedCategory, correctedCategory, normalizedMerchantKey, acceptedPrediction: predictedCategory === correctedCategory, details: { source: 'user-correction', merchantKey: normalizedMerchantKey } },
      update: { predictedCategory, correctedCategory, normalizedMerchantKey, acceptedPrediction: predictedCategory === correctedCategory, details: { source: 'user-correction', merchantKey: normalizedMerchantKey, updated: true } }
    });
    await tx.transaction.update({ where: { id: transaction.id }, data: { category: correctedCategory } });
    return feedback;
  }, { isolationLevel: 'Serializable' });
  return { feedback: result };
}
