import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http-errors.js';

export const SUPPORTED_CURRENCIES = Object.freeze([
  'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN'
]);

const PRIMARY_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,JPY,CHF,CAD,AUD,NZD,SEK,NOK,DKK,PLN';
const FALLBACK_URL = 'https://open.er-api.com/v6/latest/EUR';
const DEFAULT_CACHE_TTL_SECONDS = 900;
const DEFAULT_MAX_STALE_SECONDS = 604800;
const FETCH_TIMEOUT_MS = 4500;

function cacheTtlSeconds(app) {
  const configured = Number.parseInt(process.env.FX_RATE_CACHE_TTL_SECONDS || '900', 10);
  return Number.isSafeInteger(configured) && configured >= 30 && configured <= 86400 ? configured : DEFAULT_CACHE_TTL_SECONDS;
}

function maxStaleSeconds() {
  const configured = Number.parseInt(process.env.FX_RATE_MAX_STALE_SECONDS || '604800', 10);
  return Number.isSafeInteger(configured) && configured >= 60 && configured <= 2592000 ? configured : DEFAULT_MAX_STALE_SECONDS;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`FX provider returned HTTP ${response.status}`);
  return response.json();
}

async function readProvider(provider) {
  if (provider === 'FRANKFURTER') {
    const data = await getJson(PRIMARY_URL);
    if (!data || data.base !== 'EUR' || !data.rates || !data.date) throw new Error('Invalid Frankfurter response.');
    return { source: 'FRANKFURTER', date: data.date, euroRates: { EUR: 1, ...data.rates } };
  }
  const data = await getJson(FALLBACK_URL);
  if (!data || data.result !== 'success' || data.base_code !== 'EUR' || !data.rates) throw new Error('Invalid fallback FX response.');
  const date = data.time_last_update_utc ? new Date(data.time_last_update_utc) : new Date();
  return { source: 'OPEN_ER_API', date: Number.isNaN(date.getTime()) ? new Date() : date, euroRates: { EUR: 1, ...data.rates } };
}

function providerRateRows(result, now, ttlSeconds) {
  const supported = Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => [currency, Number(result.euroRates[currency])]));
  for (const currency of SUPPORTED_CURRENCIES) {
    if (!Number.isFinite(supported[currency]) || supported[currency] <= 0) {
      if (currency === 'EUR') supported[currency] = 1;
      else throw new Error(`FX provider omitted ${currency}.`);
    }
  }
  const asOf = typeof result.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.date)
    ? new Date(`${result.date}T00:00:00.000Z`)
    : new Date(result.date);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const rows = [];
  for (const baseCurrency of SUPPORTED_CURRENCIES) {
    for (const quoteCurrency of SUPPORTED_CURRENCIES) {
      if (baseCurrency === quoteCurrency) continue;
      rows.push({
        baseCurrency,
        quoteCurrency,
        rate: new Prisma.Decimal(supported[quoteCurrency]).div(supported[baseCurrency]).toDecimalPlaces(12),
        source: result.source,
        asOf,
        fetchedAt: now,
        expiresAt
      });
    }
  }
  return rows;
}

async function persistProviderRates(app, result) {
  const now = new Date();
  const rows = providerRateRows(result, now, cacheTtlSeconds(app));
  for (let start = 0; start < rows.length; start += 24) {
    const batch = rows.slice(start, start + 24);
    await Promise.all(batch.map((row) => app.prisma.fxRate.upsert({
      where: {
        baseCurrency_quoteCurrency_source_asOf: {
          baseCurrency: row.baseCurrency,
          quoteCurrency: row.quoteCurrency,
          source: row.source,
          asOf: row.asOf
        }
      },
      create: row,
      update: { rate: row.rate, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt }
    })));
  }
  return { source: result.source, asOf: result.date };
}

async function findStoredRate(app, fromCurrency, toCurrency, allowStale) {
  const now = new Date();
  const where = { baseCurrency: fromCurrency, quoteCurrency: toCurrency };
  if (allowStale) where.fetchedAt = { gte: new Date(now.getTime() - maxStaleSeconds() * 1000) };
  else where.expiresAt = { gt: now };
  return app.prisma.fxRate.findFirst({ where, orderBy: [{ fetchedAt: 'desc' }, { asOf: 'desc' }] });
}

async function performRefreshRates(app) {
  const errors = [];
  for (const provider of ['FRANKFURTER', 'OPEN_ER_API']) {
    try {
      const response = await readProvider(provider);
      await persistProviderRates(app, response);
      return { source: response.source, asOf: response.date, stale: false };
    } catch (error) {
      errors.push({ provider, message: error.message });
      app.log?.warn?.({ provider, message: error.message }, 'FX provider unavailable; attempting fallback');
    }
  }
  const cached = await findStoredRate(app, 'EUR', 'USD', true);
  if (cached) return { source: cached.source, asOf: cached.asOf, stale: true, providerErrors: errors };
  throw new AppError(503, 'Live exchange rates are unavailable and no recent cached rate can be used.', 'FX_UNAVAILABLE');
}

const refreshPromises = new WeakMap();
function refreshRates(app) {
  const active = refreshPromises.get(app);
  if (active) return active;
  const pending = performRefreshRates(app).finally(() => refreshPromises.delete(app));
  refreshPromises.set(app, pending);
  return pending;
}

export async function getFxRate(app, fromCurrency, toCurrency) {
  if (!SUPPORTED_CURRENCIES.includes(fromCurrency) || !SUPPORTED_CURRENCIES.includes(toCurrency)) {
    throw new AppError(400, 'Unsupported currency.', 'UNSUPPORTED_CURRENCY');
  }
  if (fromCurrency === toCurrency) return { rate: new Prisma.Decimal(1), source: null, asOf: new Date(), stale: false };

  let rate = await findStoredRate(app, fromCurrency, toCurrency, false);
  if (rate) return { rate: new Prisma.Decimal(rate.rate.toString()), source: rate.source, asOf: rate.asOf, stale: false };

  const refresh = await refreshRates(app);
  rate = await findStoredRate(app, fromCurrency, toCurrency, false);
  if (rate) return { rate: new Prisma.Decimal(rate.rate.toString()), source: rate.source, asOf: rate.asOf, stale: false };

  rate = await findStoredRate(app, fromCurrency, toCurrency, true);
  if (rate && refresh.stale) return { rate: new Prisma.Decimal(rate.rate.toString()), source: rate.source, asOf: rate.asOf, stale: true };
  throw new AppError(503, 'No exchange rate is available for this currency pair.', 'FX_PAIR_UNAVAILABLE');
}

export async function listFxRates(app, baseCurrency) {
  const reference = await getFxRate(app, baseCurrency, baseCurrency === 'EUR' ? 'USD' : 'EUR');
  const rows = await app.prisma.fxRate.findMany({
    where: { baseCurrency, expiresAt: { gt: new Date() } },
    orderBy: { quoteCurrency: 'asc' }
  });
  let available = rows;
  if (!available.length) {
    await refreshRates(app);
    available = await app.prisma.fxRate.findMany({ where: { baseCurrency }, orderBy: [{ quoteCurrency: 'asc' }, { fetchedAt: 'desc' }] });
  }
  const newestByQuote = new Map();
  for (const item of available) {
    const existing = newestByQuote.get(item.quoteCurrency);
    if (!existing || new Date(item.fetchedAt) > new Date(existing.fetchedAt)) newestByQuote.set(item.quoteCurrency, item);
  }
  const rates = [...newestByQuote.values()].sort((a, b) => a.quoteCurrency.localeCompare(b.quoteCurrency));
  const latestAsOf = rates.reduce((latest, item) => !latest || new Date(item.asOf) > new Date(latest) ? item.asOf : latest, null);
  return { rates: rates.map(serializeRate), source: rates[0]?.source || reference.source, stale: reference.stale, asOf: latestAsOf };
}

function serializeRate(item) {
  return { baseCurrency: item.baseCurrency, quoteCurrency: item.quoteCurrency, rate: item.rate.toString(), source: item.source, asOf: item.asOf, fetchedAt: item.fetchedAt, expiresAt: item.expiresAt };
}

export async function listFxHistory(app, baseCurrency, quoteCurrency, from, to, limit) {
  return app.prisma.fxRate.findMany({
    where: { baseCurrency, quoteCurrency, ...(from || to ? { asOf: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    orderBy: [{ asOf: 'desc' }, { fetchedAt: 'desc' }],
    take: limit
  }).then((rows) => rows.map((item) => ({ asOf: item.asOf, rate: item.rate.toString(), source: item.source, fetchedAt: item.fetchedAt })));
}

export function canonicalConversionRequest(amount, fromCurrency, toCurrency) {
  const decimal = new Prisma.Decimal(String(amount));
  if (!decimal.isFinite() || decimal.lte(0) || decimal.gt('1000000000') || decimal.decimalPlaces() > 8) {
    throw new AppError(400, 'Amount must be positive, no greater than 1,000,000,000, and have at most 8 decimal places.', 'INVALID_CONVERSION_AMOUNT');
  }
  const canonicalAmount = decimal.toFixed(8);
  const requestHash = createHash('sha256').update(JSON.stringify({ amount: canonicalAmount, fromCurrency, toCurrency })).digest('hex');
  return { decimal, canonicalAmount, requestHash };
}

export async function convertCurrency(app, { userId, idempotencyKey, amount, fromCurrency, toCurrency }) {
  const { decimal, canonicalAmount, requestHash } = canonicalConversionRequest(amount, fromCurrency, toCurrency);
  if (!SUPPORTED_CURRENCIES.includes(fromCurrency) || !SUPPORTED_CURRENCIES.includes(toCurrency)) {
    throw new AppError(400, 'Unsupported currency.', 'UNSUPPORTED_CURRENCY');
  }
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey || '')) {
    throw new AppError(400, 'An Idempotency-Key header between 16 and 128 safe characters is required.', 'IDEMPOTENCY_KEY_REQUIRED');
  }
  const existing = await app.prisma.fxConversion.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new AppError(409, 'This idempotency key was already used with a different conversion request.', 'IDEMPOTENCY_KEY_REUSED');
    return { conversion: serializeConversion(existing), replayed: true };
  }

  const fx = await getFxRate(app, fromCurrency, toCurrency);
  const convertedAmount = decimal.mul(fx.rate).toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
  try {
    const created = await app.prisma.fxConversion.create({ data: {
      userId,
      idempotencyKey,
      requestHash,
      amount: decimal.toDecimalPlaces(8),
      fromCurrency,
      toCurrency,
      rate: fx.rate,
      convertedAmount,
      rateSource: fx.source,
      rateAsOf: fx.asOf
    } });
    return { conversion: serializeConversion(created), replayed: false, staleRate: fx.stale };
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const raced = await app.prisma.fxConversion.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (raced?.requestHash === requestHash) return { conversion: serializeConversion(raced), replayed: true };
    throw new AppError(409, 'This idempotency key was already used with a different conversion request.', 'IDEMPOTENCY_KEY_REUSED');
  }
}

function serializeConversion(item) {
  return {
    id: item.id,
    amount: item.amount.toString(),
    fromCurrency: item.fromCurrency,
    toCurrency: item.toCurrency,
    rate: item.rate.toString(),
    convertedAmount: item.convertedAmount.toString(),
    rateSource: item.rateSource,
    rateAsOf: item.rateAsOf,
    createdAt: item.createdAt
  };
}
