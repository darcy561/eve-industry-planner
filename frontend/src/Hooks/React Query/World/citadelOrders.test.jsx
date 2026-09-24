import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../tests/queryClients.js";

const { ordersForTypeAtCitadels, sources } = vi.hoisted(() => ({
  ordersForTypeAtCitadels: vi.fn(async () => []),
  sources: { current: [] },
}));

vi.mock("../../../Functions/MarketData/ordersAtCitadels", async (real) => ({
  ...(await real()),
  ordersForTypeAtCitadels,
}));

vi.mock("../../Static/useMarketSources", () => ({
  useMarketSources: () => sources.current,
}));

const { useCitadelOrdersQuery } = await import("./citadelOrders.js");

const FORGE = 10000002;

const citadel = (id, regionID = FORGE) => ({ id, kind: "citadel", regionID });

function Subject({ typeID, regionID }) {
  const { orders, isLoading } = useCitadelOrdersQuery(typeID, regionID);
  return (
    <p>
      {isLoading ? "reading" : "read"} {orders.length}
    </p>
  );
}

let client;

function show(props) {
  client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Subject {...props} />
    </QueryClientProvider>,
  );
}

const shown = () => screen.getByText(/read|reading/).textContent.trim();

beforeEach(() => {
  vi.clearAllMocks();
  ordersForTypeAtCitadels.mockResolvedValue([]);
  sources.current = [];
});

describe("a type's orders at the citadels in a region", () => {
  it("reads the citadels the region holds", async () => {
    sources.current = [
      citadel("perimeter"),
      citadel("elsewhere", 10000043),
      { id: "jita", kind: "hub", regionID: FORGE },
    ];
    ordersForTypeAtCitadels.mockResolvedValue([{ type_id: 34 }]);

    show({ typeID: 34, regionID: FORGE });

    await waitFor(() => expect(shown()).toBe("read 1"));
    expect(ordersForTypeAtCitadels).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "perimeter" })],
      34,
    );
  });

  // The region's own orders already answer for everywhere public, so a region
  // with nothing saved in it has no reason to touch the store at all.
  it("asks nothing where no citadel is saved in the region", async () => {
    sources.current = [citadel("elsewhere", 10000043)];

    show({ typeID: 34, regionID: FORGE });

    await waitFor(() => expect(shown()).toBe("read 0"));
    expect(ordersForTypeAtCitadels).not.toHaveBeenCalled();
  });

  it("asks nothing without a type", async () => {
    sources.current = [citadel("perimeter")];

    show({ typeID: undefined, regionID: FORGE });

    await waitFor(() => expect(shown()).toBe("read 0"));
    expect(ordersForTypeAtCitadels).not.toHaveBeenCalled();
  });

  // The registry hands out a new array whenever anything in it moves, and the
  // same markets may arrive in a different order — the account's own lane
  // answering before the composed set does, say. Either is the same question.
  it("does not read again for the same markets in another order", async () => {
    sources.current = [citadel("perimeter"), citadel("tranquility")];

    const { rerender } = show({ typeID: 34, regionID: FORGE });
    await waitFor(() =>
      expect(ordersForTypeAtCitadels).toHaveBeenCalledTimes(1),
    );

    sources.current = [citadel("tranquility"), citadel("perimeter")];
    rerender(
      <QueryClientProvider client={client}>
        <Subject typeID={34} regionID={FORGE} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(shown()).toBe("read 0"));
    expect(ordersForTypeAtCitadels).toHaveBeenCalledTimes(1);
  });

  // Saving a citadel is what makes one appear, and a key that did not move
  // would leave the reader looking at a region that has not noticed.
  it("reads again once another citadel is saved in the region", async () => {
    sources.current = [citadel("perimeter")];

    const { rerender } = show({ typeID: 34, regionID: FORGE });
    await waitFor(() =>
      expect(ordersForTypeAtCitadels).toHaveBeenCalledTimes(1),
    );

    sources.current = [citadel("perimeter"), citadel("tranquility")];
    rerender(
      <QueryClientProvider client={client}>
        <Subject typeID={34} regionID={FORGE} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(ordersForTypeAtCitadels).toHaveBeenCalledTimes(2),
    );
  });

  it("holds no orders while the store has not answered", async () => {
    sources.current = [citadel("perimeter")];
    ordersForTypeAtCitadels.mockImplementation(() => new Promise(() => {}));

    show({ typeID: 34, regionID: FORGE });

    await waitFor(() => expect(shown()).toBe("reading 0"));
  });
});
