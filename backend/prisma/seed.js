import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnv });
const prisma = new PrismaClient();

async function main() {
  const configuredAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (configuredAdminEmail && configuredAdminPassword) {
    if (configuredAdminPassword.length < 16) throw new Error('SEED_ADMIN_PASSWORD must contain at least 16 characters.');
    await upsertUser({
      email: configuredAdminEmail,
      firstName: 'BillScope',
      lastName: 'Administrator',
      phone: '+38344111222',
      role: 'ADMIN',
      password: configuredAdminPassword,
      demo: false
    });
    console.info(`Admin seed ready for ${configuredAdminEmail}.`);
  }

  if (process.env.NODE_ENV !== 'production' && process.env.BILLSCOPE_SEED_DEMO === 'true') {
    const user = await upsertUser({
      email: 'demo@billscope.local',
      firstName: 'Alex',
      lastName: 'Morgan',
      phone: '+38344123456',
      role: 'CLIENT',
      password: process.env.SEED_DEMO_PASSWORD || 'Demo-Only-Password#2026',
      demo: true
    });
    await seedDemoData(user.id);
    console.info('Demo data ready for demo@billscope.local. Do not enable demo seeding in production.');
  }
}

async function upsertUser({ email, firstName, lastName, phone, role, password, demo }) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await prisma.user.upsert({
    where: { email },
    update: { firstName, lastName, phone, role, passwordHash, isActive: true },
    create: { email, firstName, lastName, phone, role, passwordHash, preferredCurrency: 'EUR' }
  });
  const checking = await prisma.account.upsert({
    where: { id: `seed-checking-${user.id}` },
    update: {},
    create: { id: `seed-checking-${user.id}`, userId: user.id, name: demo ? 'Everyday account' : 'Admin account', institutionName: 'BillScope demo', accountType: 'CHECKING', currency: 'EUR', balance: demo ? 1240.5 : 0, availableBalance: demo ? 1240.5 : 0 }
  });
  const savings = await prisma.account.upsert({
    where: { id: `seed-savings-${user.id}` },
    update: {},
    create: { id: `seed-savings-${user.id}`, userId: user.id, name: 'Savings', institutionName: 'BillScope demo', accountType: 'SAVINGS', currency: 'EUR', balance: demo ? 385 : 0, availableBalance: demo ? 385 : 0 }
  });
  return { ...user, checking, savings };
}

async function seedDemoData(userId) {
  const checking = await prisma.account.findFirst({ where: { userId, accountType: 'CHECKING', isArchived: false } });
  const now = new Date();
  const sampleTransactions = [
    ['demo-coffee', 'Corner Coffee', 'Corner Coffee', 'Restaurants', 'EXPENSE', 3.2, 2],
    ['demo-groceries', 'Weekly groceries', 'Meridian Market', 'Groceries', 'EXPENSE', 42.75, 4],
    ['demo-subscription', 'Monthly streaming subscription', 'Streamline', 'Subscriptions', 'EXPENSE', 8.99, 5],
    ['demo-transport', 'City Transit', 'City Transit', 'Transport', 'EXPENSE', 2.5, 7],
    ['demo-salary', 'Monthly salary', 'Employer Payroll', 'Salary', 'INCOME', 1250, 9],
    ['demo-pharmacy', 'Pharmacy essentials', 'City Pharmacy', 'Health', 'EXPENSE', 14.4, 12],
    ['demo-dinner', 'Dinner with friends', 'Olive Kitchen', 'Restaurants', 'EXPENSE', 24.6, 14]
  ];
  for (const [externalId, description, merchant, category, type, amount, daysAgo] of sampleTransactions) {
    await prisma.transaction.upsert({
      where: { externalId },
      update: {},
      create: {
        userId, accountId: checking.id, externalId, description, merchant, category, type,
        amount, currency: 'EUR', source: 'demo-seed', occurredAt: new Date(now.getTime() - daysAgo * 86400000)
      }
    });
  }
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  await prisma.bill.upsert({
    where: { id: `demo-rent-${userId}` }, update: {},
    create: { id: `demo-rent-${userId}`, userId, accountId: checking.id, title: 'Rent', amount: 420, currency: 'EUR', category: 'Housing', dueDate: new Date(now.getFullYear(), now.getMonth(), Math.min(27, 28)), recurringPeriod: 'MONTHLY', status: 'UPCOMING' }
  });
  await prisma.bill.upsert({
    where: { id: `demo-internet-${userId}` }, update: {},
    create: { id: `demo-internet-${userId}`, userId, accountId: checking.id, title: 'Internet', amount: 24.99, currency: 'EUR', category: 'Utilities', dueDate: new Date(now.getFullYear(), now.getMonth(), Math.min(18, 28)), recurringPeriod: 'MONTHLY', status: 'UPCOMING' }
  });
  await prisma.spendingLimit.upsert({
    where: { userId_category_period: { userId, category: 'Groceries', period: 'MONTHLY' } },
    update: { name: 'Groceries', amount: 220 },
    create: { userId, name: 'Groceries', category: 'Groceries', amount: 220, currency: 'EUR', period: 'MONTHLY' }
  });
  await prisma.spendingLimit.upsert({
    where: { userId_category_period: { userId, category: 'Restaurants', period: 'MONTHLY' } },
    update: { name: 'Eating out', amount: 100 },
    create: { userId, name: 'Eating out', category: 'Restaurants', amount: 100, currency: 'EUR', period: 'MONTHLY' }
  });
  await prisma.scheduledIncome.upsert({
    where: { id: `demo-salary-schedule-${userId}` }, update: {},
    create: { id: `demo-salary-schedule-${userId}`, userId, description: 'Monthly salary', amount: 1250, currency: 'EUR', expectedAt: new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 10, 28)), period: 'MONTHLY' }
  });
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
