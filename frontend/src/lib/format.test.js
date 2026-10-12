import { describe, expect, it } from 'vitest';
import { formatCurrency, getInitials, titleCase } from './format.js';

describe('display formatting', () => {
  it('formats values using the selected currency', () => {
    expect(formatCurrency(12.5, 'EUR')).toContain('12.50');
    expect(formatCurrency(1200, 'JPY')).not.toContain('.00');
  });

  it('creates initials without leaking whitespace', () => {
    expect(getInitials(' Donat ', 'Halimi')).toBe('DH');
  });

  it('renders API enum strings in title case', () => {
    expect(titleCase('ROUND_UP')).toBe('Round Up');
  });
});
