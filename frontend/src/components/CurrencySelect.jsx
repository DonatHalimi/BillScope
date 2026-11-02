import { Select } from './ui/input.jsx';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN'];

export function CurrencySelect({ id, value, onChange, currencies = SUPPORTED_CURRENCIES, ...props }) {
  return <Select id={id} value={value} onChange={onChange} {...props}>
    {currencies.map((currency) => <option key={currency} value={currency}>{currency} — {new Intl.DisplayNames(['en'], { type: 'currency' }).of(currency) || currency}</option>)}
  </Select>;
}
