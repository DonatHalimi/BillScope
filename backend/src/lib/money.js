export const SUPPORTED_CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP', 'JPY', 'CHF']);

export function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new TypeError('Amount must be a finite number.');
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

export function roundUpAmount(amount) {
  const cents = toCents(amount);
  const wholeUnitCents = Math.ceil(cents / 100) * 100;
  return fromCents(wholeUnitCents - cents);
}

export function asNumber(value) {
  return typeof value === 'number' ? value : Number(value?.toString?.() ?? value ?? 0);
}
