import { mockBankProvider } from './mock-bank-provider.js';

const providers = new Map([['mock', mockBankProvider]]);

export function getProviderAdapter(name = 'mock') {
  const adapter = providers.get(name);
  if (!adapter) throw new Error(`Provider adapter "${name}" is not configured.`);
  return adapter;
}

export function registerProviderAdapter(name, adapter) {
  if (!name || !adapter || typeof adapter.listInstitutions !== 'function' || typeof adapter.pullTransactions !== 'function') {
    throw new TypeError('Provider adapters must expose listInstitutions() and pullTransactions().');
  }
  providers.set(name, adapter);
}
