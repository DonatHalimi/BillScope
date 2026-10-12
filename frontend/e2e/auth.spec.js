import { test, expect } from '@playwright/test';
import { createUserFactory, createTransactionFactory } from './factories.js';

async function mockDashboardApi(page, user, { authenticated = false } = {}) {
  const transaction = createTransactionFactory();
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body = {};
    let status = 200;
    if (path === '/api/auth/refresh') {
      if (authenticated) body = { accessToken: 'test-access-token', user };
      else { status = 401; body = { error: 'No refresh session', code: 'REFRESH_MISSING' }; }
    } else if (path === '/api/auth/login' && method === 'POST') {
      body = { accessToken: 'test-access-token', user };
    } else if (path === '/api/dashboard/overview') {
      body = { overview: { firstName: user.firstName, role: user.role, currency: 'EUR', totalBalance: 1240.5, monthlyIncome: 1250, monthlyExpenses: 185.75, netMonthlyCashFlow: 1064.25, accountCount: 2, upcomingBillsCount: 2, activeBudgetsCount: 1, recentTransactions: [transaction] } };
    } else if (path.startsWith('/api/transactions')) {
      body = { transactions: [transaction], nextCursor: null };
    } else if (path === '/api/accounts') {
      body = { accounts: [{ id: 'checking-1', name: 'Everyday account', institutionName: 'Personal', accountType: 'CHECKING', currency: 'EUR', balance: 1240.5, availableBalance: 1240.5, roundUpsEnabled: false }, { id: 'savings-1', name: 'Savings', institutionName: 'Personal', accountType: 'SAVINGS', currency: 'EUR', balance: 385, availableBalance: 385, roundUpsEnabled: false }] };
    } else if (path === '/api/forecasting/summary') {
      body = { forecast: { currency: 'EUR', horizonDays: 30, historicalDays: 90, currentBalance: 1625.5, incomingIncome: 1250, upcomingBills: 444.99, historicalSpend90Days: 557.25, averageMonthlySpend: 185.75, projectedBalance: 2244.76, bills: [] } };
    } else if (path === '/api/budgets') {
      body = { budgets: [] };
    } else if (path === '/api/forecasting/income') {
      body = { incomes: [] };
    } else if (path === '/api/provider/institutions') {
      body = { institutions: [{ id: 'evergreen-bank', name: 'Evergreen Bank', country: 'XK', currencies: ['EUR', 'CHF'] }] };
    } else if (path === '/api/provider/connections') {
      body = { connections: [] };
    } else if (path === '/api/profile') {
      body = { user };
    } else {
      body = { error: 'Not mocked', code: 'NOT_MOCKED' };
      status = 404;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('guest can sign in and is routed to the dashboard', async ({ page }) => {
  const user = createUserFactory();
  await mockDashboardApi(page, user);
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Your money at a glance' })).toBeVisible();
  await expect(page.getByText('€1,240.50')).toBeVisible();
});

test('register form explicitly requests the five required identity fields', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'No refresh session' }) }));
  await page.goto('/register');
  await expect(page.getByLabel('First name')).toBeVisible();
  await expect(page.getByLabel('Last name')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '12');
  await expect(page.getByLabel('Phone number')).toBeVisible();
});

test('authenticated guest route redirects to dashboard', async ({ page }) => {
  const user = createUserFactory();
  await mockDashboardApi(page, user, { authenticated: true });
  await page.goto('/login');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Your money at a glance' })).toBeVisible();
});
