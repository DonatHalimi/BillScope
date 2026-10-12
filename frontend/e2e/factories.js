export function createUserFactory(overrides = {}) {
  return {
    id: 'test-user-001',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex@example.test',
    phone: '+38344123456',
    role: 'CLIENT',
    preferredCurrency: 'EUR',
    createdAt: '2026-01-10T10:00:00.000Z',
    ...overrides
  };
}

export function createTransactionFactory(overrides = {}) {
  return {
    id: 'test-transaction-001',
    type: 'EXPENSE',
    status: 'POSTED',
    description: 'Corner Coffee',
    merchant: 'Corner Coffee',
    category: 'Restaurants',
    amount: 3.2,
    roundUpAmount: 0,
    currency: 'EUR',
    occurredAt: '2026-10-08T10:00:00.000Z',
    source: 'manual',
    account: { id: 'test-account-001', name: 'Everyday account', currency: 'EUR' },
    destinationAccount: null,
    ...overrides
  };
}
