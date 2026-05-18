import { getConfig } from "./config";
import { convex } from "./convex-client";

type CoinMarketCapQuoteResponse = {
  data?: {
    XMR?: {
      quote?: {
        USD?: {
          last_updated?: string;
          price?: number;
        };
      };
    };
  };
  status?: {
    error_code?: number;
    error_message?: string | null;
  };
};

export type XmrUsdQuote = {
  fetchedAt: number;
  lastUpdatedAt?: number;
  priceUsdDecimal?: string;
  priceUsdMicro: string;
  source: "coinmarketcap";
  symbol: "XMR";
};

function priceDecimalToMicro(price: string) {
  if (!/^[1-9]\d*(\.\d+)?$/.test(price)) {
    throw new Error("CoinMarketCap returned an invalid XMR/USD price");
  }

  const [whole, fraction = ""] = price.split(".");
  const microFraction = fraction.padEnd(7, "0");
  const firstSix = microFraction.slice(0, 6);
  const seventh = Number(microFraction[6] ?? "0");
  const base = BigInt(whole) * BigInt(1_000_000) + BigInt(firstSix);

  return (base + (seventh >= 5 ? BigInt(1) : BigInt(0))).toString();
}

function extractUsdPriceDecimal(rawBody: string) {
  const match = rawBody.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match?.[1]) {
    throw new Error("CoinMarketCap response did not include XMR/USD price");
  }
  return match[1];
}

export async function fetchXmrUsdFromCoinMarketCap(): Promise<XmrUsdQuote> {
  const config = getConfig();
  if (!config.CMC_API_KEY) {
    throw new Error("CMC_API_KEY is required to refresh XMR/USD price");
  }

  const url = new URL(
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
  );
  url.searchParams.set("symbol", "XMR");
  url.searchParams.set("convert", "USD");

  const response = await fetch(url, {
    headers: {
      "X-CMC_PRO_API_KEY": config.CMC_API_KEY,
      accept: "application/json",
    },
  });
  const rawBody = await response.text();
  const body = JSON.parse(rawBody) as CoinMarketCapQuoteResponse;

  if (!response.ok || body.status?.error_code) {
    throw new Error(
      body.status?.error_message ??
        `CoinMarketCap request failed with ${response.status}`,
    );
  }

  const usd = body.data?.XMR?.quote?.USD;
  if (!usd?.price) {
    throw new Error("CoinMarketCap response did not include XMR/USD price");
  }
  const priceUsdDecimal = extractUsdPriceDecimal(rawBody);

  return {
    fetchedAt: Date.now(),
    lastUpdatedAt: usd.last_updated
      ? new Date(usd.last_updated).getTime()
      : undefined,
    priceUsdDecimal,
    priceUsdMicro: priceDecimalToMicro(priceUsdDecimal),
    source: "coinmarketcap",
    symbol: "XMR",
  };
}

export async function refreshXmrUsdPrice() {
  const quote = await fetchXmrUsdFromCoinMarketCap();
  await convex.mutation(convex.refs.upsertPriceQuote, quote);
  return quote;
}

export async function getFreshXmrUsdPrice() {
  const config = getConfig();
  const cached = await convex.query<XmrUsdQuote | null>(
    convex.refs.getLatestPriceQuote,
    { symbol: "XMR", quoteCurrency: "USD" },
  );
  const now = Date.now();

  if (
    cached?.priceUsdDecimal &&
    now - cached.fetchedAt <= config.CMC_PRICE_CACHE_MAX_AGE_MS
  ) {
    return cached;
  }

  return refreshXmrUsdPrice();
}
