import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const fetchMarketPricesQuery = vi.fn();
vi.mock("../../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const { queryClient } = await import("../../../queryClient.js");
const { revalidateMarketRefreshTimes } = await import("./priceCache.js");
const { readMarketPriceForType } = await import("./marketPriceForType.js");
const { useMarketPricesQuery } =
  await import("../../../Hooks/React Query/World/marketPrices.js");

const typePrice = (sell) => ({
  buy: sell - 1,
  sell,
  buyP95: sell,
  sellP05: sell,
});

const answerAt = (refreshedAt, sell) => ({
  sources: { jita: { refreshedAt, prices: { 34: typePrice(sell) } } },
  adjusted: null,
});

const WANTS = [{ typeID: 34, marketLocation: "jita" }];

function Subject() {
  const { isLoading } = useMarketPricesQuery(WANTS);
  const price = readMarketPriceForType(34, "jita", "sell");

  return <p>{isLoading ? "pricing" : `sell ${price}`}</p>;
}

beforeEach(() => {
  queryClient.clear();
  fetchMarketPricesQuery.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("a market walks its orders again while a surface is open", () => {
  it("shows the reader the new figure", async () => {
    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757000000000, 10));

    render(
      <QueryClientProvider client={queryClient}>
        <Subject />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("sell 10")).toBeTruthy();

    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757003600000, 30));
    await revalidateMarketRefreshTimes();

    expect(await screen.findByText("sell 30")).toBeTruthy();
  });

  it("never shows the superseded figure again on the way", async () => {
    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757000000000, 10));

    render(
      <QueryClientProvider client={queryClient}>
        <Subject />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("sell 10")).toBeTruthy();

    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757003600000, 30));
    await revalidateMarketRefreshTimes();
    expect(await screen.findByText("sell 30")).toBeTruthy();

    expect(screen.queryByText("sell 0")).toBeNull();
  });
});
