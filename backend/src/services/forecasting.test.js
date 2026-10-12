import { describe, expect, it, vi } from 'vitest';
import { calculateForecast } from './forecasting.js';

function makeForecastPrisma({ balance = 1000, bills = [], incomes = [], expenses = 600 } = {}) {
  return {
    user: { findUnique: vi.fn(async () => ({ preferredCurrency: 'EUR' })) },
    account: { findMany: vi.fn(async () => [{ balance }]) },
    bill: { findMany: vi.fn(async () => bills) },
    scheduledIncome: { findMany: vi.fn(async () => incomes) },
    transaction: { aggregate: vi.fn(async () => ({ _sum: { amount: expenses } })) }
  };
}

describe('30-day cash-flow forecast', () => {
  it('implements balance plus income minus bills and historical average spend', async () => {
    const now = new Date('2026-10-10T10:00:00.000Z');
    const prisma = makeForecastPrisma({
      balance: 1000,
      bills: [{ title: 'Internet', amount: 70, dueDate: new Date('2026-10-20T00:00:00.000Z') }, { title: 'Phone', amount: 20, dueDate: new Date('2026-10-25T00:00:00.000Z') }],
      incomes: [{ description: 'Salary', amount: 1200, expectedAt: new Date('2026-10-15T00:00:00.000Z'), period: 'MONTHLY' }],
      expenses: 600
    });
    const result = await calculateForecast(prisma, 'user-1', now);
    expect(result).toMatchObject({ currency: 'EUR', horizonDays: 30, historicalDays: 90, currentBalance: 1000, incomingIncome: 1200, upcomingBills: 90, historicalSpend90Days: 600, averageMonthlySpend: 200, projectedBalance: 1910 });
  });

  it('does not project one-time income that falls outside the horizon', async () => {
    const now = new Date('2026-10-10T10:00:00.000Z');
    const prisma = makeForecastPrisma({ balance: 25, incomes: [{ description: 'Bonus', amount: 500, expectedAt: new Date('2027-01-01T00:00:00.000Z'), period: 'ONCE' }], expenses: 0 });
    const result = await calculateForecast(prisma, 'user-1', now);
    expect(result.incomingIncome).toBe(0);
    expect(result.projectedBalance).toBe(25);
  });
});
