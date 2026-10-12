import { describe, expect, it } from 'vitest';
import { suggestCategory } from './categorize.js';
import { roundUpAmount, toCents } from './money.js';

describe('rule-based categorisation', () => {
  it.each([
    ['Meridian Market groceries', 'Groceries'],
    ['Spotify monthly subscription', 'Subscriptions'],
    ['City Transit pass', 'Transport'],
    ['Monthly salary payment', 'Salary'],
    ['Corner Coffee espresso', 'Restaurants']
  ])('suggests %s as %s', (description, expected) => {
    expect(suggestCategory(description).category).toBe(expected);
  });

  it('returns a low-confidence fallback for an unknown merchant', () => {
    expect(suggestCategory('XK 83-ABZ-001')).toMatchObject({ category: 'Uncategorised', confidence: 0.15, matchedRule: null });
  });

  it('normalizes whitespace and rejects empty input', () => {
    expect(suggestCategory('   ').category).toBe('Uncategorised');
    expect(suggestCategory('  netflix  ').category).toBe('Subscriptions');
  });
});

describe('money minor-unit utilities', () => {
  it('converts to cents without binary float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
  it.each([[2.35, 0.65], [2.0, 0], [3.99, 0.01], [0.01, 0.99]])('rounds %s up to the next whole unit', (amount, expected) => {
    expect(roundUpAmount(amount)).toBe(expected);
  });
});
