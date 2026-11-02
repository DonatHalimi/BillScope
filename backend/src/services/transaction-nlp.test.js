import { describe, expect, it } from 'vitest';
import { classifyTransactionText, normalizeMerchantKey } from './transaction-nlp.js';

describe('transaction NLP classification', () => {
  it('normalizes merchant identifiers consistently', () => {
    expect(normalizeMerchantKey('NETFLIX.COM* 123456789')).toBe('netflix com');
  });

  it('classifies subscription merchant text with a confidence score', () => {
    const prediction = classifyTransactionText({ merchant: 'Netflix', description: 'monthly streaming plan', category: 'Uncategorised' });
    expect(prediction.category).toBe('Subscriptions');
    expect(prediction.confidence).toBeGreaterThanOrEqual(0.45);
    expect(prediction.confidence).toBeLessThanOrEqual(0.96);
    expect(prediction.source).toBe('local-nlp');
  });

  it('uses the user correction feedback when it is available', () => {
    const prediction = classifyTransactionText({ merchant: 'Acme Market', description: 'card purchase', category: 'Uncategorised' }, ['Groceries', 'Groceries', 'Groceries', 'Shopping']);
    expect(prediction.category).toBe('Groceries');
    expect(prediction.source).toBe('user-feedback');
  });

  it('preserves an already categorized transaction', () => {
    const prediction = classifyTransactionText({ merchant: 'Netflix', description: 'monthly', category: 'Entertainment' });
    expect(prediction.category).toBe('Entertainment');
    expect(prediction.confidence).toBe(1);
  });
});
