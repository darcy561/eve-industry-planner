import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prices/priceStore.js", () => ({ readStoredOrders: vi.fn() }));

const { readStoredOrders } = await import("../prices/priceStore.js");
const { ordersForTypeAtCitadels } = await import("./ordersAtCitadels");

const order = (typeID, locationID, price) => ({
  type_id: typeID,
  location_id: locationID,
  price,
  is_buy_order: false,
});

const heldAt = (held) => {
  readStoredOrders.mockImplementation(
    async (marketLocation) => held[marketLocation],
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("one type's orders at the citadels in a region", () => {
  it("takes only the type that was asked for", async () => {
    heldAt({
      a: { orders: [order(34, 1, 5), order(35, 1, 9), order(34, 1, 6)] },
    });

    const orders = await ordersForTypeAtCitadels([{ id: "a" }], 34);

    expect(orders.map((o) => o.price)).toEqual([5, 6]);
  });

  // A region may hold several saved citadels, and the view is region-wide.
  it("gathers every citadel it was given", async () => {
    heldAt({
      a: { orders: [order(34, 1, 5)] },
      b: { orders: [order(34, 2, 7)] },
    });

    const orders = await ordersForTypeAtCitadels(
      [{ id: "a" }, { id: "b" }],
      34,
    );

    expect(orders.map((o) => o.location_id).sort()).toEqual([1, 2]);
  });

  // The id survives a round trip through storage, and nothing guarantees which
  // side of the comparison is holding text.
  it("matches a type id held as text against one asked for as a number", async () => {
    heldAt({ a: { orders: [order("34", 1, 5)] } });

    const orders = await ordersForTypeAtCitadels([{ id: "a" }], 34);

    expect(orders).toHaveLength(1);
  });

  it("does not take a type whose id merely starts the same", async () => {
    heldAt({ a: { orders: [order(345, 1, 5), order(34, 1, 6)] } });

    const orders = await ordersForTypeAtCitadels([{ id: "a" }], 34);

    expect(orders.map((o) => o.price)).toEqual([6]);
  });

  // A market the rotation has not reached yet is not an error in what the rest
  // of the region says.
  it("passes over a citadel nothing has read", async () => {
    heldAt({ a: undefined, b: { orders: [order(34, 2, 7)] } });

    const orders = await ordersForTypeAtCitadels(
      [{ id: "a" }, { id: "b" }],
      34,
    );

    expect(orders.map((o) => o.price)).toEqual([7]);
  });

  it("is empty where no citadel is saved in the region", async () => {
    expect(await ordersForTypeAtCitadels([], 34)).toEqual([]);
    expect(readStoredOrders).not.toHaveBeenCalled();
  });

  // Reading the store to answer about no type would spend the budget for
  // nothing.
  it("asks nothing without a type", async () => {
    expect(await ordersForTypeAtCitadels([{ id: "a" }], undefined)).toEqual([]);
    expect(readStoredOrders).not.toHaveBeenCalled();
  });
});
