import { formatCurrency } from '../lib/format.js';

export function Money({ amount, currency = 'EUR', className = '' }) {
  return <span className={`tabular-nums ${className}`}>{formatCurrency(amount, currency)}</span>;
}

export function formatMoney(amount, currency = 'EUR') {
  return formatCurrency(amount, currency);
}
