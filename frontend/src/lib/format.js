export function formatCurrency(amount, currency = 'EUR', locale = 'en-GB') {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: currency === 'JPY' ? 0 : 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

export function getInitials(firstName = '', lastName = '') {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || 'B';
}

export function titleCase(value = '') {
  return String(value).toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
