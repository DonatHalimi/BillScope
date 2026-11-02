import { AppError } from '../lib/http-errors.js';

const CATEGORY_TERMS = Object.freeze({
  Subscriptions: ['netflix', 'spotify', 'disney', 'hulu', 'youtube premium', 'icloud', 'dropbox', 'adobe', 'microsoft 365', 'prime video', 'subscription', 'streaming', 'membership', 'monthly plan'],
  Groceries: ['grocery', 'supermarket', 'market', 'bakery', 'butcher', 'food shop', 'vegetables', 'produce', 'spar', 'aldi', 'lidl', 'tesco', 'rewe', 'carrefour'],
  Restaurants: ['restaurant', 'cafe', 'coffee', 'takeaway', 'delivery', 'food delivery', 'mcdonald', 'burger', 'pizza', 'kebab', 'barista', 'wolt', 'glovo', 'uber eats'],
  Transport: ['fuel', 'petrol', 'diesel', 'gas station', 'parking', 'toll', 'taxi', 'uber', 'bolt', 'bus', 'train', 'transit', 'vehicle', 'car wash'],
  Utilities: ['electricity', 'energy', 'water bill', 'utility', 'internet', 'broadband', 'mobile plan', 'telecom', 'phone bill', 'heating', 'waste collection'],
  Housing: ['rent', 'mortgage', 'property management', 'landlord', 'housing', 'home repairs', 'maintenance fee'],
  Insurance: ['insurance', 'premium', 'policy', 'coverage'],
  Health: ['pharmacy', 'hospital', 'clinic', 'doctor', 'dentist', 'medical', 'healthcare', 'prescription', 'laboratory'],
  Shopping: ['online store', 'retail', 'clothing', 'electronics', 'amazon', 'ebay', 'aliexpress', 'mall', 'apparel', 'department store'],
  Entertainment: ['cinema', 'movie theater', 'concert', 'ticket', 'museum', 'game', 'gaming', 'theatre', 'theater', 'event venue'],
  Travel: ['hotel', 'flight', 'airline', 'airport', 'booking.com', 'airbnb', 'hostel', 'resort', 'travel agency'],
  Debt: ['loan repayment', 'credit card', 'finance charge', 'debt payment', 'installment', 'lending', 'interest payment']
});

const STOPWORDS = new Set(['the', 'and', 'for', 'from', 'with', 'payment', 'purchase', 'card', 'debit', 'credit', 'transaction', 'online', 'pos', 'terminal', 'ref', 'direct']);

export function normalizeMerchantKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token))
    .join(' ')
    .trim()
    .slice(0, 90) || 'unknown merchant';
}

export function classifyTransactionText(transaction, feedbackCategories = []) {
  const merchant = String(transaction.merchant || '');
  const description = String(transaction.description || '');
  const normalizedMerchantKey = normalizeMerchantKey(merchant || description);
  const existingCategory = String(transaction.category || 'Uncategorised');
  if (existingCategory !== 'Uncategorised') return { category: existingCategory, confidence: 1, source: 'existing', normalizedMerchantKey };

  if (feedbackCategories.length) {
    const votes = new Map();
    for (const feedback of feedbackCategories) votes.set(feedback, (votes.get(feedback) || 0) + 1);
    const [category, count] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { category, confidence: Math.min(0.99, 0.78 + Math.min(count, 5) * 0.04), source: 'user-feedback', normalizedMerchantKey };
  }

  const text = `${merchant} ${description}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const scores = [];
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += term.includes(' ') ? 2 : 1;
    }
    if (score) scores.push({ category, score });
  }
  scores.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  if (!scores.length) return { category: 'Uncategorised', confidence: 0.25, source: 'none', normalizedMerchantKey };
  const best = scores[0];
  const total = scores.reduce((sum, row) => sum + row.score, 0);
  const runnerUp = scores[1]?.score || 0;
  const confidence = Math.max(0.45, Math.min(0.96, 0.50 + (best.score / total) * 0.35 + ((best.score - runnerUp) / best.score) * 0.11));
  return { category: best.category, confidence: Number(confidence.toFixed(4)), source: 'local-nlp', normalizedMerchantKey };
}

export async function classifyUncategorisedTransactions(app, userId) {
  const transactions = await app.prisma.transaction.findMany({
    where: { userId, status: 'POSTED', category: 'Uncategorised', type: { in: ['EXPENSE', 'INCOME'] } },
    select: { id: true, userId: true, merchant: true, description: true, category: true, type: true },
    orderBy: { occurredAt: 'desc' },
    take: 2500
  });
  if (!transactions.length) return { inspected: 0, updated: 0 };

  const keys = [...new Set(transactions.map((tx) => normalizeMerchantKey(tx.merchant || tx.description)))];
  const feedbackRows = await app.prisma.transactionClassificationFeedback.findMany({
    where: { userId, normalizedMerchantKey: { in: keys } },
    select: { normalizedMerchantKey: true, correctedCategory: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 2500
  });
  const feedbackByMerchant = new Map();
  for (const row of feedbackRows) {
    if (!feedbackByMerchant.has(row.normalizedMerchantKey)) feedbackByMerchant.set(row.normalizedMerchantKey, []);
    feedbackByMerchant.get(row.normalizedMerchantKey).push(row.correctedCategory);
  }

  const idsByCategory = new Map();
  for (const tx of transactions) {
    const key = normalizeMerchantKey(tx.merchant || tx.description);
    const prediction = classifyTransactionText(tx, feedbackByMerchant.get(key) || []);
    if (prediction.category === 'Uncategorised' || prediction.confidence < 0.45) continue;
    if (!idsByCategory.has(prediction.category)) idsByCategory.set(prediction.category, []);
    idsByCategory.get(prediction.category).push(tx.id);
  }

  const results = await Promise.all([...idsByCategory].map(([category, ids]) => app.prisma.transaction.updateMany({
    where: { userId, id: { in: ids }, category: 'Uncategorised' },
    data: { category }
  })));
  return { inspected: transactions.length, updated: results.reduce((sum, result) => sum + result.count, 0) };
}

export async function classifyOneTransaction(app, userId, payload) {
  const transaction = await app.prisma.transaction.findFirst({
    where: { id: payload.transactionId, userId },
    select: { id: true, userId: true, merchant: true, description: true, category: true, type: true }
  });
  if (!transaction) throw new AppError(404, 'Transaction not found.', 'TRANSACTION_NOT_FOUND');
  const merchantKey = normalizeMerchantKey(transaction.merchant || transaction.description);
  const feedbackRows = await app.prisma.transactionClassificationFeedback.findMany({
    where: { userId, normalizedMerchantKey: merchantKey },
    select: { correctedCategory: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  return { transactionId: transaction.id, prediction: classifyTransactionText(transaction, feedbackRows.map((row) => row.correctedCategory)) };
}
