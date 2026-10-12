import { asNumber } from '../lib/money.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function addPeriod(anchor, period, occurrence = 1) {
  const original = new Date(anchor);
  if (period === 'WEEKLY') {
    original.setDate(original.getDate() + (7 * occurrence));
    return original;
  }
  const monthOffset = period === 'MONTHLY' ? occurrence : occurrence * 12;
  const year = original.getFullYear();
  const month = original.getMonth() + monthOffset;
  const day = original.getDate();
  const targetMonth = new Date(year, month, 1, original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds());
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(day, lastDay));
  return targetMonth;
}

function occurrenceInWindow(income, now, horizon) {
  const anchor = new Date(income.expectedAt);
  if (income.period === 'ONCE') {
    return anchor >= now && anchor <= horizon ? asNumber(income.amount) : 0;
  }
  let occurrence = 0;
  let next = anchor;
  while (next < now && occurrence < 240) {
    occurrence += 1;
    next = addPeriod(anchor, income.period, occurrence);
  }
  let total = 0;
  while (next >= now && next <= horizon && occurrence < 300) {
    total += asNumber(income.amount);
    occurrence += 1;
    next = addPeriod(anchor, income.period, occurrence);
  }
  return total;
}

export async function calculateForecast(prisma, userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferredCurrency: true } });
  if (!user) throw new Error('User not found while calculating forecast.');
  const currency = user.preferredCurrency;
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const lookback = new Date(now.getTime() - 90 * DAY_MS);

  const [accounts, bills, incomes, history] = await Promise.all([
    prisma.account.findMany({ where: { userId, currency, isArchived: false }, select: { balance: true } }),
    prisma.bill.findMany({
      where: { userId, currency, status: { in: ['UPCOMING', 'OVERDUE'] }, dueDate: { lte: horizon } },
      select: { amount: true, dueDate: true, title: true }
    }),
    prisma.scheduledIncome.findMany({
      where: { userId, currency, active: true },
      select: { amount: true, expectedAt: true, period: true, description: true }
    }),
    prisma.transaction.aggregate({
      where: { userId, currency, type: 'EXPENSE', status: 'POSTED', occurredAt: { gte: lookback, lte: now } },
      _sum: { amount: true }
    })
  ]);

  const currentBalance = accounts.reduce((sum, account) => sum + asNumber(account.balance), 0);
  const upcomingBills = bills.reduce((sum, bill) => sum + asNumber(bill.amount), 0);
  const incomingIncome = incomes.reduce((sum, income) => sum + occurrenceInWindow(income, now, horizon), 0);
  const historicalSpend90Days = asNumber(history._sum.amount);
  const averageMonthlySpend = historicalSpend90Days / 3;
  const projectedBalance = currentBalance + incomingIncome - (upcomingBills + averageMonthlySpend);

  return {
    currency,
    horizonDays: 30,
    historicalDays: 90,
    currentBalance: round2(currentBalance),
    incomingIncome: round2(incomingIncome),
    upcomingBills: round2(upcomingBills),
    historicalSpend90Days: round2(historicalSpend90Days),
    averageMonthlySpend: round2(averageMonthlySpend),
    projectedBalance: round2(projectedBalance),
    bills: bills.map((bill) => ({ ...bill, amount: asNumber(bill.amount) }))
  };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
