import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const { fetchPrices } = vi.hoisted(() => ({
  fetchPrices: vi.fn(async () => {}),
}));

vi.mock("../../../Functions/MarketData/priceCache", () => ({ fetchPrices }));

const { useMarketPricesQuery } = await import("./marketPrices.js");

function Subject({ wants, adjustedTypeIDs, enabled }) {
  const { isLoading } = useMarketPricesQuery(wants, {
    adjustedTypeIDs,
    enabled,
  });
  return <p>{isLoading ? "pricing" : "priced"}</p>;
}

const want = (typeID, sourceID) => ({ typeID, sourceID });

let client;

function show(props) {
  client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Subject {...props} />
    </QueryClientProvider>,
  );
}

function again(props) {
  return (
    <QueryClientProvider client={client}>
      <Subject {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("holding a surface behind its prices", () => {
  it("asks for the wants it was given", async () => {
    show({ wants: [want(34, "jita"), want(35, "amarr")] });

    await waitFor(() => expect(fetchPrices).toHaveBeenCalled());
    expect(fetchPrices.mock.calls[0][0].wants).toEqual(
      expect.arrayContaining([want(34, "jita"), want(35, "amarr")]),
    );
  });

  // A type wanted at two markets is two wants, and asking for it once would
  // leave whichever panel read the other market with nothing.
  it("keeps one type's two markets apart", async () => {
    show({ wants: [want(34, "jita"), want(34, "amarr")] });

    await waitFor(() => expect(fetchPrices).toHaveBeenCalled());
    expect(fetchPrices.mock.calls[0][0].wants).toHaveLength(2);
  });

  it("says when it has finished", async () => {
    show({ wants: [want(34, "jita")] });

    expect(screen.getByText("pricing")).toBeInTheDocument();
    expect(await screen.findByText("priced")).toBeInTheDocument();
  });

  it("asks for nothing when there is nothing to price", () => {
    show({ wants: [] });

    expect(screen.getByText("priced")).toBeInTheDocument();
    expect(fetchPrices).not.toHaveBeenCalled();
  });

  // Adjusted prices belong to no market, so a caller wanting only those has
  // nothing in its wants and still has something to fetch.
  it("asks when only adjusted prices are wanted", async () => {
    show({ wants: [], adjustedTypeIDs: [34] });

    await waitFor(() => expect(fetchPrices).toHaveBeenCalled());
    expect(fetchPrices.mock.calls[0][0].adjustedTypeIDs).toEqual(["34"]);
  });

  it("waits until it is enabled", () => {
    show({ wants: [want(34, "jita")], enabled: false });

    expect(fetchPrices).not.toHaveBeenCalled();
  });

  // The same wants are the same request however they were handed over: in a
  // different order, or with repeats.
  it("does not ask twice for the same wants", async () => {
    const { rerender } = show({ wants: [want(34, "jita"), want(35, "jita")] });
    await waitFor(() => expect(fetchPrices).toHaveBeenCalledTimes(1));

    rerender(again({ wants: [want(35, "jita"), want(34, "jita")] }));
    rerender(
      again({ wants: [want(34, "jita"), want(35, "jita"), want(35, "jita")] }),
    );

    expect(fetchPrices).toHaveBeenCalledTimes(1);
  });
});
