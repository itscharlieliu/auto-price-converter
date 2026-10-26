import { describe, it, expect, afterEach } from "vitest";
import type { ExchangeRates, Settings } from "$lib/types";
import type { PageContext } from "../context";
import { buildPatterns } from "./patterns";
import { replacePrices } from "./replacer";
import { containsCurrencyIndicators } from "./priceDetector";

// Regression tests for split prices spaced only by CSS, as rendered by
// airline fare cards (e.g. Singapore Airlines choose-flight):
//   <span>SGD</span><span>2,540</span><span>.40</span>
// Raw textContent glues this into "SGD2,540.40" - no whitespace and no
// word boundary between the ISO code and the amount.

const exchangeRates: ExchangeRates = {
  base: "EUR",
  date: "2026-10-23",
  rates: { EUR: 1, USD: 1.1193, SGD: 1.431 },
};

const settings: Settings = {
  enabled: true,
  targetCurrency: "USD",
  showOriginalPrice: false,
  highlightConverted: false,
  decimalPlaces: 2,
  numberFormat: "en-US",
  theme: "system",
  exclusionList: [],
};

const pageContext: PageContext = {
  locale: "en-SG",
  localeSource: "html-lang",
  currency: null,
  currencySource: "none",
  currencyConfidence: "none",
};

const patterns = buildPatterns(exchangeRates);

function setOffsetParents(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", {
    value: document.body,
    configurable: true,
  });
  el.querySelectorAll("*").forEach((child) =>
    Object.defineProperty(child, "offsetParent", {
      value: document.body,
      configurable: true,
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("split prices spaced only by CSS", () => {
  it("quick check detects an ISO code glued to an amount", () => {
    expect(containsCurrencyIndicators("SGD2,540.40", patterns)).toBe(true);
    expect(containsCurrencyIndicators("2,540.40SGD", patterns)).toBe(true);
    expect(containsCurrencyIndicators("hello world", patterns)).toBe(false);
  });

  it("converts a fare price split across spans with no whitespace", () => {
    const price = document.createElement("div");
    price.innerHTML = `<span>SGD</span><span>2,540</span><span>.40</span>`;
    setOffsetParents(price);

    const replaced = replacePrices(price, {
      settings,
      exchangeRates,
      patterns,
      pageContext,
    });

    expect(replaced).toBe(true);
    // 2,540.40 SGD -> EUR -> USD at the rates above
    expect(price.textContent).toContain("$1,987.05");
  });

  it("converts a fare price inside a fare card element", () => {
    const card = document.createElement("div");
    card.innerHTML =
      `<div>ECONOMY STANDARD</div><div>Per adult</div>` +
      `<div><span>SGD</span><span>3,081</span><span>.40</span><span>›</span></div>`;
    setOffsetParents(card);

    const priceRow = card.children[2] as HTMLElement;
    const replaced = replacePrices(priceRow, {
      settings,
      exchangeRates,
      patterns,
      pageContext,
    });

    expect(replaced).toBe(true);
    // 3,081.40 SGD -> EUR -> USD at the rates above
    expect(priceRow.textContent).toContain("$2,410.21");
  });
});
