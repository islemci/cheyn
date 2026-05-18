import { refreshXmrUsdPrice } from "./coinmarketcap";

async function main() {
  const quote = await refreshXmrUsdPrice();
  console.log("Refreshed XMR/USD price", {
    fetchedAt: new Date(quote.fetchedAt).toISOString(),
    lastUpdatedAt: quote.lastUpdatedAt
      ? new Date(quote.lastUpdatedAt).toISOString()
      : undefined,
    priceUsdDecimal: quote.priceUsdDecimal,
    priceUsdMicro: quote.priceUsdMicro,
    source: quote.source,
    symbol: quote.symbol,
  });
}

void main().catch((error) => {
  console.error("Price refresh failed", error);
  process.exitCode = 1;
});
