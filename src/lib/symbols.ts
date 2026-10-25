import type { SymbolsResponse } from "./types";
import { getCachedSymbols, setCachedSymbols } from "./storage";

const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_RATES_API_BASE ?? "https://api.frankfurter.dev/v1";
};

export async function fetchSymbols(): Promise<SymbolsResponse> {
  const url = `${getApiBaseUrl()}/currencies`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return { provider: "frankfurter", symbols: {} };
    }
    throw new Error(`Failed to fetch symbols: ${response.statusText}`);
  }

  const data = await response.json();

  // Frankfurter /currencies returns a flat map: { USD: "United States Dollar", ... }
  // Tolerate the legacy backend shape { provider, symbols } if
  // VITE_RATES_API_BASE is pointed back at a compatible backend.
  if (data && typeof data === "object" && "symbols" in data) {
    return {
      provider: data.provider ?? "frankfurter",
      symbols: data.symbols ?? {},
    };
  }
  return {
    provider: "frankfurter",
    symbols: data ?? {},
  };
}

export async function getSymbols(): Promise<Record<string, string>> {
  const cached = await getCachedSymbols();
  if (cached) {
    return cached.symbols;
  }

  const response = await fetchSymbols();
  if (Object.keys(response.symbols).length > 0) {
    const cachedSymbols = {
      symbols: response.symbols,
      fetchedAt: Date.now(),
    };
    await setCachedSymbols(cachedSymbols);
  }
  return response.symbols;
}

export async function refreshSymbols(): Promise<Record<string, string>> {
  const response = await fetchSymbols();
  if (Object.keys(response.symbols).length > 0) {
    const cachedSymbols = {
      symbols: response.symbols,
      fetchedAt: Date.now(),
    };
    await setCachedSymbols(cachedSymbols);
  }
  return response.symbols;
}
