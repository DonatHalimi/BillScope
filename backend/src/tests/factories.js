import { vi } from 'vitest';

export function createTestConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 5000,
    frontendUrl: 'http://localhost:3000',
    databaseUrl: 'postgresql://test:test@localhost:5432/billscope_test?schema=public',
    jwtSecret: 'test-jwt-secret-that-is-long-enough-for-hs256-00001',
    cookieSecret: 'test-cookie-secret-that-is-long-enough-to-sign-cookies',
    accessTokenTtlSeconds: 600,
    refreshTokenTtlSeconds: 604800,
    rememberRefreshTokenTtlSeconds: 2592000,
    ...overrides
  };
}

export function createUserFactory(overrides = {}) {
  return {
    id: 'user-test-001',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex@example.test',
    phone: '+38344123456',
    passwordHash: 'argon-test-hash',
    role: 'CLIENT',
    preferredCurrency: 'EUR',
    isActive: true,
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    ...overrides
  };
}

export function createPrismaMock() {
  let accountCounter = 0;
  let billCounter = 0;
  const prisma = {
    user: {
      create: vi.fn(async ({ data }) => createUserFactory(data)),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }) => ({ ...createUserFactory(), ...data })),
      count: vi.fn(async () => 0),
      upsert: vi.fn(async ({ create }) => createUserFactory(create))
    },
    account: {
      create: vi.fn(async ({ data }) => ({ id: `account-test-${++accountCounter}`, ...data })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      aggregate: vi.fn(async () => ({ _sum: { balance: 0 } })),
      count: vi.fn(async () => 0)
    },
    refreshToken: {
      create: vi.fn(async ({ data }) => ({ id: data.id || 'refresh-test', ...data })),
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data }))
    },
    transaction: {
      create: vi.fn(async ({ data, include }) => ({ id: 'transaction-test', ...data, ...(include ? { account: { id: data.accountId, name: 'Everyday account', currency: 'EUR' } } : {}) })),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
      count: vi.fn(async () => 0)
    },
    bill: {
      create: vi.fn(async ({ data }) => ({ id: `bill-test-${++billCounter}`, ...data })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0)
    },
    spendingLimit: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }) => ({ id: 'budget-test', ...create })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0)
    },
    scheduledIncome: {
      create: vi.fn(async ({ data }) => ({ id: 'income-test', ...data })),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data }))
    },
    bankConnection: {
      create: vi.fn(async ({ data }) => ({ id: 'connection-test', ...data })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      count: vi.fn(async () => 0)
    },
    savingsGoal: {},
    $transaction: vi.fn(async (operation) => typeof operation === 'function' ? operation(prisma) : operation),
    $disconnect: vi.fn(async () => {})
  };
  return prisma;
}
