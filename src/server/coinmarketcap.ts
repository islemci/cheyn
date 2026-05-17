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
  priceUsdMicro: string;
  source: "coinmarketcap";
  symbol: "XMR";
};

function priceToMicro(price: number) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("CoinMarketCap returned an invalid XMR/USD price");
  }
  return Math.round(price * 1_000_000).toString();
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
  const body = (await response.json()) as CoinMarketCapQuoteResponse;

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

  return {
    fetchedAt: Date.now(),
    lastUpdatedAt: usd.last_updated
      ? new Date(usd.last_updated).getTime()
      : undefined,
    priceUsdMicro: priceToMicro(usd.price),
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

  if (cached && now - cached.fetchedAt <= config.CMC_PRICE_CACHE_MAX_AGE_MS) {
    return cached;
  }

  return refreshXmrUsdPrice();
}
