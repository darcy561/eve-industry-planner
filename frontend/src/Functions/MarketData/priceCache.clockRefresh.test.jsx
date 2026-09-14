import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

/**
 * A mounted surface and a moved clock, over the real cache and loader.
 *
 * The unit tests either side of this one prove the imperative halves: that a
 * moved clock drops the rows, and that asking again after it fetches. Neither
 * says what a reader sees, because a surface does not call `fetchPrices` when
 * something changes — it reads prices synchronously while rendering and is held
 * up by `useMarketPricesQuery`. So the question this file exists for is whether
 * a market walking its book again reaches a dashboard someone is looking at.
 */

const fetchMarketPricesQuery = vi.fn();
vi.mock("../Endpoints/Public/marketPricesQuery", () => ({
  fetchMarketPricesQuery: (...args) => fetchMarketPricesQuery(...args),
}));

const { queryClient } = await import("../../queryClient.js");
const { resetSourceClocks } = await import("./sourceClocks.js");
const { revalidateSourceClocks } = await import("./priceCache.js");
const { getMarketPriceForType } = await import("./marketPriceForType.js");
const { useMarketPricesQuery } =
  await import("../../Hooks/React Query/World/marketPrices.js");

const row = (sell) => ({ buy: sell - 1, sell, buyP95: sell, sellP05: sell });

const answerAt = (refreshedAt, sell) => ({
  sources: { jita: { refreshedAt, prices: { 34: row(sell) } } },
  adjusted: null,
});

const WANTS = [{ typeID: 34, sourceID: "jita" }];

/** Reads its price the way every priced surface does: synchronously, in render. */
function Subject() {
  const { isLoading } = useMarketPricesQuery(WANTS);
  const price = getMarketPriceForType(34, "jita", "sell");

  return <p>{isLoading ? "pricing" : `sell ${price}`}</p>;
}

beforeEach(() => {
  queryClient.clear();
  resetSourceClocks();
  fetchMarketPricesQuery.mockReset();
});

afterEach(() => {
  queryClient.clear();
  resetSourceClocks();
});

describe("a market walks its book again while a surface is open", () => {
  it("shows the reader the new figure", async () => {
    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757000000000, 10));

    render(
      <QueryClientProvider client={queryClient}>
        <Subject />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("sell 10")).toBeTruthy();

    // The probe finds Jita has been walked again since those rows arrived.
    fetchMarketPricesQuery.mockResolvedValue(answerAt(1757003600000, 30));
    await revalidateSourceClocks();

    // Nothing about the surface changed — no navigation, no store update, no
    // remount. The reader is looking at the same panel, and the figure on it
    // must be the one the market now publishes.
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
    await revalidateSourceClocks();
    expect(await screen.findByText("sell 30")).toBeTruthy();

    // Dropping a market's rows leaves the accessor answering zero until the
    // refetch lands, and a price flashing to zero reads as free rather than as
    // loading. The held rows must stay readable until the new ones replace them.
    expect(screen.queryByText("sell 0")).toBeNull();
  });
});
