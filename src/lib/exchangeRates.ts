// Exchange rates API utilities
// Fork change: rates come directly from the public Frankfurter API
// (European Central Bank reference rates, no API key, CORS-enabled)
// instead of the author's apc-api.xerrion.io backend.

import currency from "currency.js";
import type {
  ExchangeRates,
  CachedRates,
  MajorCurrency,
  CurrencyCode,
} from "./types";
import { getCachedRates, setCachedRates } from "./storage";

const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_RATES_API_BASE ?? "https://api.frankfurter.dev/v1";
};

/**
 * Fetches the latest exchange rates from the Frankfurter API
 * Uses EUR as base currency and fetches ALL available currencies
 * Frankfurter response shape: { amount, base, date, rates }
 */
export async function fetchLatestRates(): Promise<ExchangeRates> {
  const url = `${getApiBaseUrl()}/latest?base=EUR`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.base && data.base !== "EUR") {
    throw new Error(`Unexpected base currency from Frankfurter: ${data.base}`);
  }

  return {
    base: "EUR",
    date: data.date,
    // Frankfurter has no fetched_at; stamp the fetch time so the
    // 24h cache check in storage.ts (which requires fetchedAt) works.
    // A legacy backend response may still provide fetched_at.
    fetchedAt: data.fetched_at ?? new Date().toISOString(),
    rates: {
      EUR: 1,
      ...data.rates,
    },
  };
}

/**
 * Gets exchange rates, using cache if available and fresh
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  // Try to get cached rates first
  const cached = await getCachedRates();
  if (cached) {
    console.log("Using cached exchange rates from:", cached.rates.date);
    return cached.rates;
  }

  // Fetch fresh rates
  console.log("Fetching fresh exchange rates...");
  const rates = await fetchLatestRates();

  // Cache the rates
  const cachedRates: CachedRates = {
    rates,
    fetchedAt: Date.now(),
  };
  await setCachedRates(cachedRates);

  console.log("Exchange rates fetched and cached:", rates.date);
  return rates;
}

/**
 * Converts an amount from one currency to another using the provided rates
 * Uses currency.js for precise decimal arithmetic to avoid floating-point errors
 * fromCurrency: Major currency detected on the page
 * toCurrency: Any currency the user has selected as target
 */
export function convertCurrency(
  amount: number,
  fromCurrency: MajorCurrency,
  toCurrency: CurrencyCode,
  rates: ExchangeRates,
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Convert to EUR first (base currency), then to target
  const fromRate = rates.rates[fromCurrency];
  const toRate = rates.rates[toCurrency];

  if (!fromRate || !toRate) {
    throw new Error(
      `Missing exchange rate for ${fromCurrency} or ${toCurrency}`,
    );
  }

  // Use currency.js for precise arithmetic
  // Convert: amount in fromCurrency -> EUR -> toCurrency
  const amountInEur = currency(amount, { precision: 10 }).divide(fromRate);
  const convertedAmount = amountInEur.multiply(toRate);

  return convertedAmount.value;
}
