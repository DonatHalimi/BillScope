import { randomUUID } from 'node:crypto';

const INSTITUTIONS = Object.freeze([
  { id: 'evergreen-bank', name: 'Evergreen Bank', country: 'XK', currencies: ['EUR', 'CHF'] },
  { id: 'northstar-credit-union', name: 'Northstar Credit Union', country: 'XK', currencies: ['EUR', 'USD'] },
  { id: 'meridian-digital', name: 'Meridian Digital', country: 'EU', currencies: ['EUR', 'GBP', 'USD'] }
]);

const TRANSACTION_FEED = Object.freeze([
  { id: 'feed-groceries', description: 'Meridian Market groceries', merchant: 'Meridian Market', amount: 32.48, type: 'EXPENSE', category: 'Groceries', daysAgo: 1 },
  { id: 'feed-coffee', description: 'Corner Coffee', merchant: 'Corner Coffee', amount: 3.2, type: 'EXPENSE', category: 'Restaurants', daysAgo: 2 },
  { id: 'feed-transport', description: 'City Transit', merchant: 'City Transit', amount: 2.5, type: 'EXPENSE', category: 'Transport', daysAgo: 3 },
  { id: 'feed-subscription', description: 'Monthly streaming subscription', merchant: 'Streamline', amount: 8.99, type: 'EXPENSE', category: 'Subscriptions', daysAgo: 4 },
  { id: 'feed-salary', description: 'Salary payment', merchant: 'Employer Payroll', amount: 1250, type: 'INCOME', category: 'Salary', daysAgo: 6 }
]);

export class MockBankProvider {
  listInstitutions() {
    return INSTITUTIONS.map((institution) => ({ ...institution }));
  }

  async connect({ userId, institutionId, currency }) {
    const institution = INSTITUTIONS.find((item) => item.id === institutionId);
    if (!institution) return null;
    return {
      provider: 'mock',
      externalItemId: `mock-item:${userId}:${institution.id}:${randomUUID()}`,
      institutionName: institution.name,
      currency: currency || institution.currencies[0]
    };
  }

  async pullTransactions({ connectionId, now = new Date() }) {
    return TRANSACTION_FEED.map((item) => ({
      ...item,
      externalId: `mock:${connectionId}:${item.id}`,
      occurredAt: new Date(now.getTime() - item.daysAgo * 24 * 60 * 60 * 1000)
    }));
  }
}

export const mockBankProvider = new MockBankProvider();
