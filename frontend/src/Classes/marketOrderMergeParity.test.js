import { describe, expect, it } from "vitest";

import MarketOrder from "./marketOrder";

/**
 * What the planner did before `MarketOrder.applyLatest` owned it: the merge that
 * lived in useMarketOrdersAndWorldData, copied here as the reference the class
 * must agree with.
 *
 * It is kept whole rather than tidied, because its value is being the previous
 * behaviour exactly.
 */
function legacyMerge(order, latestOrderData) {
  if (!order.complete) {
    const shouldBeComplete =
      latestOrderData.volume_remain === 0 ||
      latestOrderData.state === "expired" ||
      latestOrderData.state === "cancelled";
    const newState = latestOrderData.state ? latestOrderData.state : "active";

    if (
      order.volume_remain !== latestOrderData.volume_remain ||
      Date.parse(order.issued) !== Date.parse(latestOrderData.issued) ||
      shouldBeComplete ||
      order?.state !== newState
    ) {
      order.duration = latestOrderData.duration;
      order.item_price = latestOrderData.price;
      order.range = latestOrderData.range;
      order.volume_remain = latestOrderData.volume_remain;
      order.issued = latestOrderData.issued;
      order.timeStamps = [...(order.timeStamps || []), latestOrderData.issued];
      order.complete = shouldBeComplete;
      order.state = newState;
      return true;
    }
  }
  return false;
}

const STORED = {
  order_id: 900,
  type_id: 34,
  item_price: 5,
  volume_total: 100,
  volume_remain: 40,
  duration: 90,
  issued: "2026-08-01T00:00:00Z",
  location_id: 60003760,
  region_id: 10000002,
  range: "region",
  state: "open",
  is_corporation: false,
  timeStamps: ["2026-07-25T00:00:00Z"],
  CharacterHash: "hash-1",
};

const UPDATES = {
  "some sold": {
    volume_remain: 25,
    price: 5.5,
    issued: "2026-08-02T00:00:00Z",
    duration: 90,
    range: "region",
    state: "open",
  },
  "sold out": {
    volume_remain: 0,
    price: 5.5,
    issued: "2026-08-02T00:00:00Z",
    duration: 90,
    range: "region",
    state: "open",
  },
  expired: {
    volume_remain: 40,
    price: 5,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
    state: "expired",
  },
  cancelled: {
    volume_remain: 40,
    price: 5,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
    state: "cancelled",
  },
  "relisted at a new price": {
    volume_remain: 40,
    price: 6,
    issued: "2026-08-03T00:00:00Z",
    duration: 30,
    range: "station",
    state: "open",
  },
  "nothing moved": {
    volume_remain: 40,
    price: 5,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
    state: "open",
  },
  "no state reported": {
    volume_remain: 30,
    price: 5,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
  },
};

// The fields the merge is responsible for. `complete` is excluded: the class
// derives it rather than storing it, which is the one deliberate difference.
const MERGED_FIELDS = [
  "duration",
  "item_price",
  "range",
  "volume_remain",
  "issued",
  "timeStamps",
  "state",
];

describe("taking the latest state of a market order", () => {
  for (const [name, latest] of Object.entries(UPDATES)) {
    it(`matches the previous merge: ${name}`, () => {
      const legacy = { ...STORED, timeStamps: [...STORED.timeStamps], complete: false };
      const order = new MarketOrder(STORED);

      const legacyTook = legacyMerge(legacy, latest);
      const took = order.applyLatest(latest);

      expect(took).toBe(legacyTook);
      for (const field of MERGED_FIELDS) {
        expect({ [field]: order[field] }).toEqual({ [field]: legacy[field] });
      }
      // What the old code stored, the class works out.
      expect(order.isComplete).toBe(legacy.complete);
    });
  }

  // The old code read a stored flag; a row written today has none, so the gate
  // has to come from the volume and state or a finished order is rewritten on
  // every poll, growing its timestamp history without end.
  it("leaves a finished order alone rather than re-taking it", () => {
    const soldOut = new MarketOrder({ ...STORED, volume_remain: 0 });
    const expired = new MarketOrder({ ...STORED, state: "expired" });
    const latest = { volume_remain: 0, price: 9, issued: "2026-08-09T00:00:00Z" };

    expect(soldOut.applyLatest(latest)).toBe(false);
    expect(expired.applyLatest(latest)).toBe(false);
    expect(soldOut.timeStamps).toEqual(STORED.timeStamps);
    expect(soldOut.item_price).toBe(STORED.item_price);
  });

  it("takes nothing from a missing update", () => {
    const order = new MarketOrder(STORED);

    expect(order.applyLatest(undefined)).toBe(false);
    expect(order.volume_remain).toBe(40);
  });
});

describe("applying the latest orders to a job", () => {
  it("matches each row by its order id and reports whether anything moved", async () => {
    const { default: applyLatestOrderData } = await import(
      "../Functions/MarketOrders/applyLatestOrderData"
    );

    const job = {
      build: {
        sale: {
          marketOrders: [
            new MarketOrder({ ...STORED, order_id: 900 }),
            new MarketOrder({ ...STORED, order_id: 901 }),
          ],
        },
      },
    };

    const changed = applyLatestOrderData(job, [
      { order_id: 901, volume_remain: 5, price: 7, issued: "2026-08-09T00:00:00Z" },
      { order_id: 999, volume_remain: 0, price: 1, issued: "2026-08-09T00:00:00Z" },
    ]);

    expect(changed).toBe(true);
    expect(job.build.sale.marketOrders[0].volume_remain).toBe(40);
    expect(job.build.sale.marketOrders[1].volume_remain).toBe(5);
  });

  it("reports nothing when no linked order was reported", async () => {
    const { default: applyLatestOrderData } = await import(
      "../Functions/MarketOrders/applyLatestOrderData"
    );

    const job = {
      build: { sale: { marketOrders: [new MarketOrder(STORED)] } },
    };

    expect(applyLatestOrderData(job, [])).toBe(false);
    expect(applyLatestOrderData(job, [{ order_id: 42, volume_remain: 0 }])).toBe(
      false,
    );
  });
});
