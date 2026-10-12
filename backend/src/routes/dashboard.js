import { asNumber } from '../lib/money.js';

export async function dashboardRoutes(app) {
  app.get('/overview', { preHandler: [app.authenticate] }, async (request) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const userId = request.user.sub;
    const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, preferredCurrency: true, role: true } });
    if (!user) return { overview: null };
    const currency = user.preferredCurrency;
    const [accounts, income, expenses, upcomingBillsCount, recentTransactions, budgets] = await Promise.all([
      app.prisma.account.findMany({ where: { userId, currency, isArchived: false }, select: { id: true, balance: true, accountType: true } }),
      app.prisma.transaction.aggregate({ where: { userId, currency, type: 'INCOME', status: 'POSTED', occurredAt: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true } }),
      app.prisma.transaction.aggregate({ where: { userId, currency, type: 'EXPENSE', status: 'POSTED', occurredAt: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true } }),
      app.prisma.bill.count({ where: { userId, currency, status: { in: ['UPCOMING', 'OVERDUE'] }, dueDate: { lte: nextThirtyDays } } }),
      app.prisma.transaction.findMany({
        where: { userId, currency }, take: 8, orderBy: { occurredAt: 'desc' },
        include: { account: { select: { id: true, name: true } }, destinationAccount: { select: { id: true, name: true } } }
      }),
      app.prisma.spendingLimit.count({ where: { userId, enabled: true, currency } })
    ]);
    const totalBalance = accounts.reduce((sum, account) => sum + asNumber(account.balance), 0);
    return {
      overview: {
        firstName: user.firstName,
        role: user.role,
        currency,
        totalBalance: round2(totalBalance),
        monthlyIncome: asNumber(income._sum.amount),
        monthlyExpenses: asNumber(expenses._sum.amount),
        netMonthlyCashFlow: round2(asNumber(income._sum.amount) - asNumber(expenses._sum.amount)),
        accountCount: accounts.length,
        upcomingBillsCount,
        activeBudgetsCount: budgets,
        recentTransactions: recentTransactions.map((item) => ({
          ...item,
          amount: asNumber(item.amount),
          roundUpAmount: asNumber(item.roundUpAmount)
        }))
      }
    };
  });
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
