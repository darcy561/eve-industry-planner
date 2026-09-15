import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

/**
 * A mounted surface and a reader-saved market whose book has expired.
 *
 * The sibling file asks the same question of a hub, where the server reports the
 * clock. This one asks it of a market nobody reports on: its rows carry the
 * expiry its own book gave them, so retiring those is local — and a surface
 * still subscribes to no row entry, so the retiring has to reach it the same way
 * a moved clock does or the reader sits on a figure its source has disowned.
 */

const ordersByRegionAndType = vi.fn();
vi.mock("./fetchStationBook", () => ({
  ordersByRegionAndType: (...args) => ordersByRegionAndType(...args),
}));

const THE_FORGE = 10000002;
const STATION = 60003760;
vi.mock("./marketSources", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    allMarketSources: () => [
      ...real.allMarketSources(),
      {
        id: "saved-station",
        name: "A station the reader saved",
        regionID: THE_FORGE,
        stationID: STATION,
        kind: real.SOURCE_KIND.STATION,
      },
    ],
  };
});

const { queryClient } = await import("../../queryClient.js");
const { expireSavedSourceRows } = await import("./priceCache.js");
const { getMarketPriceForType } = await import("./marketPriceForType.js");
const { resetPriceLoader } = await import("./priceLoader.js");
const { useMarketPricesQuery } =
  await import("../../Hooks/React Query/World/marketPrices.js");

const WANTS = [{ typeID: 34, sourceID: "saved-station" }];

const bookSelling = (price, expiresAt) => ({
  orders: [{ price, location_id: STATION, is_buy_order: false }],
  etag: "",
  expiresAt,
});

/** Reads its price the way every priced surface does: synchronously, in render. */
function Subject() {
  const { isLoading } = useMarketPricesQuery(WANTS);
  const price = getMarketPriceForType(34, "saved-station", "sell");

  return <p>{isLoading ? "pricing" : `sell ${price}`}</p>;
}

beforeEach(() => {
  queryClient.clear();
  resetPriceLoader();
  ordersByRegionAndType.mockReset();
});

afterEach(() => {
  queryClient.clear();
  resetPriceLoader();
});

describe("a saved market's book expires while a surface is open", () => {
  it("shows the reader the new figure", async () => {
    ordersByRegionAndType.mockResolvedValue(bookSelling(10, 1000));

    render(
      <QueryClientProvider client={queryClient}>
        <Subject />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("sell 10")).toBeTruthy();

    // The schedule notices the book said it would be stale by now.
    ordersByRegionAndType.mockResolvedValue(bookSelling(30, 9e12));
    expireSavedSourceRows(1001);

    // Nothing about the surface changed — no navigation, no remount. The reader
    // is looking at the same panel, and the figure on it must be the one the
    // station's book now carries.
    expect(await screen.findByText("sell 30")).toBeTruthy();
  });

  // The counterpart of the hub rule: a row whose expiry has not passed is still
  // what that market would answer with, so nothing re-reads its book.
  it("leaves a book that has not expired alone", async () => {
    ordersByRegionAndType.mockResolvedValue(bookSelling(10, 9e12));

    render(
      <QueryClientProvider client={queryClient}>
        <Subject />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("sell 10")).toBeTruthy();

    expireSavedSourceRows(1001);

    expect(ordersByRegionAndType).toHaveBeenCalledTimes(1);
    expect(screen.getByText("sell 10")).toBeTruthy();
  });
});
