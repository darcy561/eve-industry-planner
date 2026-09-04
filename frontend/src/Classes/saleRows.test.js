import { describe, expect, it } from "vitest";

import BrokerFee from "./brokerFee";
import MarketOrder from "./marketOrder";
import Transaction from "./transaction";
import Job from "./job";

describe("Transaction", () => {
  it("takes the stored id as it finds it", () => {
    expect(new Transaction({ transaction_id: 6440610546 }).transaction_id).toBe(
      6440610546,
    );
    expect(new Transaction({}).transaction_id).toBe(0);
  });

  it("tells a market sale from one entered by hand", () => {
    expect(new Transaction({ transaction_id: 500 }).isFromMarket).toBe(true);
    expect(Transaction.custom({ amount: 10 }).isFromMarket).toBe(false);
  });

  // A minted id must stay out of the space ESI issues from, or it could take
  // the id of a real transaction the account has not linked yet.
  it("mints a hand-entered id below zero, inside the safe range", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const minted = Transaction.mintCustomID();

      expect(minted).toBeLessThan(0);
      expect(Number.isSafeInteger(minted)).toBe(true);
      // Well clear of the ids ESI issues, and of the safe-integer ceiling.
      expect(Math.abs(minted)).toBeLessThanOrEqual(2 ** 48);
    }
  });

  it("does not repeat itself across a run of mints", () => {
    const minted = new Set();
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      minted.add(Transaction.mintCustomID());
    }

    expect(minted.size).toBe(1000);
  });

  it("reports what a sale brought in before and after the market's cut", () => {
    const transaction = new Transaction({ amount: 1000, tax: 25 });

    expect(transaction.grossValue).toBe(1000);
    expect(transaction.netValue).toBe(975);
  });

  // A wallet transaction carries neither the money nor the tax; both are
  // journal entries it points at.
  it("takes the money from the journal and the tax as a magnitude", () => {
    const transaction = Transaction.fromESI(
      {
        transaction_id: 6440610546,
        quantity: 10,
        unit_price: 5,
        is_personal: true,
      },
      {
        journalEntry: { amount: 50 },
        taxEntry: { amount: -1.8 },
        description: "Tritanium",
        owner: { CharacterHash: "hash-1", CharacterID: 95465499 },
      },
    );

    expect(transaction.amount).toBe(50);
    expect(transaction.tax).toBe(1.8);
    expect(transaction.description).toBe("Tritanium");
    expect(transaction.character_id).toBe(95465499);
    // A character's corporation does not own its personal sales.
    expect(transaction.corporation_id).toBeNull();
  });

  it("reads a corporation sale from ESI saying it was not personal", () => {
    expect(Transaction.fromESI({ is_personal: false }, {}).is_corp).toBe(true);
    expect(Transaction.fromESI({ is_personal: true }, {}).is_corp).toBe(false);
  });

  it("knows which order it sold through", () => {
    const transaction = new Transaction({ order_id: 12 });

    expect(transaction.belongsToOrder(12)).toBe(true);
    expect(transaction.belongsToOrder(13)).toBe(false);
    expect(new Transaction({}).belongsToOrder(null)).toBe(false);
  });

  it("keeps every stored key on the way out", () => {
    const row = {
      order_id: 12,
      journal_ref_id: 99,
      unit_price: 5,
      amount: 50,
      tax: 1,
      transaction_id: 7,
      quantity: 10,
      date: "2026-01-01T00:00:00Z",
      location_id: 60003760,
      is_corp: false,
      type_id: 34,
      description: "sold",
      CharacterHash: "hash-1",
      corporation_id: null,
      character_id: 95465499,
    };

    expect(new Transaction(row).toDocument()).toEqual(row);
  });
});

describe("MarketOrder", () => {
  it("takes ESI's price as the item price and opens the timestamp history", () => {
    const order = MarketOrder.fromESI(
      { order_id: 1, price: 250, issued: "2026-01-01T00:00:00Z", volume_total: 10 },
      { CharacterHash: "hash-1", CharacterID: 95465499 },
    );

    expect(order.item_price).toBe(250);
    expect(order.timeStamps).toEqual(["2026-01-01T00:00:00Z"]);
    expect(order.character_id).toBe(95465499);
  });

  it("names every field ESI supplies, and nothing it does not", () => {
    const order = MarketOrder.fromESI({
      order_id: 1,
      type_id: 34,
      price: 250,
      volume_total: 10,
      volume_remain: 4,
      duration: 90,
      issued: "2026-01-01T00:00:00Z",
      location_id: 60003760,
      region_id: 10000002,
      range: "region",
      is_corporation: true,
      state: "open",
      is_buy_order: false,
      min_volume: 1,
    });

    expect(order.toDocument()).toEqual({
      order_id: 1,
      type_id: 34,
      item_price: 250,
      volume_total: 10,
      volume_remain: 4,
      duration: 90,
      issued: "2026-01-01T00:00:00Z",
      location_id: 60003760,
      region_id: 10000002,
      range: "region",
      is_corporation: true,
      state: "open",
      timeStamps: ["2026-01-01T00:00:00Z"],
      CharacterHash: "",
      corporation_id: null,
      character_id: null,
    });
  });

  it("reads completion from what is left rather than a stored flag", () => {
    expect(new MarketOrder({ volume_total: 10, volume_remain: 0 }).isComplete).toBe(true);
    expect(new MarketOrder({ volume_total: 10, volume_remain: 4 }).isComplete).toBe(false);
  });

  // An order can leave the market without selling out, and it will not change
  // again once it has.
  it("counts an expired or cancelled order as finished", () => {
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4, state: "expired" })
        .isComplete,
    ).toBe(true);
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4, state: "cancelled" })
        .isComplete,
    ).toBe(true);
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4, state: "open" })
        .isComplete,
    ).toBe(false);
  });

  it("says how much has sold and how much is still listed", () => {
    const order = new MarketOrder({ volume_total: 10, volume_remain: 4, item_price: 100 });

    expect(order.quantitySold).toBe(6);
    expect(order.quantityRemaining).toBe(4);
    expect(order.remainingValue).toBe(400);
  });

  it("takes the latest state and keeps the timestamps it had", () => {
    const order = new MarketOrder({
      order_id: 1,
      item_price: 100,
      volume_total: 10,
      volume_remain: 10,
      timeStamps: ["2026-01-01T00:00:00Z"],
    });

    const taken = order.applyLatest({
      price: 90,
      volume_remain: 2,
      issued: "2026-01-02T00:00:00Z",
    });

    expect(taken).toBe(true);
    expect(order.item_price).toBe(90);
    expect(order.quantitySold).toBe(8);
    expect(order.timeStamps).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
    ]);
  });

  // A sold-out order is finished, so a later read of the same order cannot
  // reopen it.
  it("leaves a sold out order alone", () => {
    const order = new MarketOrder({ volume_total: 10, volume_remain: 0, item_price: 100 });

    expect(order.applyLatest({ price: 50, volume_remain: 5 })).toBe(false);
    expect(order.item_price).toBe(100);
  });

  // Completion is read from the volume left, so it is not stored beside it.
  it("does not store completion on the document", () => {
    const document = new MarketOrder({
      order_id: 1,
      volume_total: 10,
      volume_remain: 0,
    }).toDocument();

    expect(document).not.toHaveProperty("complete");
    expect(document.order_id).toBe(1);
  });
});

describe("BrokerFee", () => {
  it("is built from the journal entry that charged it", () => {
    const fee = BrokerFee.fromJournalEntry(
      { id: 500, date: "2026-01-01T00:00:00Z" },
      { order_id: 1 },
      1200,
    );

    expect(fee.order_id).toBe(1);
    expect(fee.id).toBe(500);
    // The worked-out fee, not the entry's own amount, which can cover more than
    // this order.
    expect(fee.amount).toBe(1200);
    expect(fee.chargedAt).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("knows which order it was charged for", () => {
    const fee = new BrokerFee({ order_id: 1 });

    expect(fee.belongsToOrder(1)).toBe(true);
    expect(fee.belongsToOrder(2)).toBe(false);
  });

  it("has no charge date without one", () => {
    expect(new BrokerFee({}).chargedAt).toBeNull();
  });

  it("keeps every stored key on the way out", () => {
    const row = {
      order_id: 1,
      id: 500,
      date: "2026-01-01T00:00:00Z",
      amount: 1200,
    };

    expect(new BrokerFee(row).toDocument()).toEqual(row);
  });
});

describe("linking a market order", () => {
  // The fee is a journal entry that may not be found — the account's own
  // journal window is limited — and losing the order over it would tell the
  // user their link worked while the job kept nothing.
  it("keeps the order when no broker fee entry was found", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });

    job.addMarketOrder({ order_id: 1, price: 5, volume_total: 10 }, null);

    expect(job.esiOrderIDs.has(1)).toBe(true);
    expect(job.build.sale.brokersFee).toHaveLength(0);
  });

  it("records the fee alongside the order when there is one", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });

    job.addMarketOrder({ order_id: 1, price: 5, volume_total: 10 }, {
      order_id: 1,
      id: 500,
      amount: 1200,
    });

    expect(job.esiOrderIDs.has(1)).toBe(true);
    expect(job.totalBrokersFees).toBe(1200);
    // Whatever the caller hands over is held as a row of its own class.
    expect(job.build.sale.brokersFee[0]).toBeInstanceOf(BrokerFee);
  });

  it("holds stored fees as rows and writes them back through the class", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: {
        sale: {
          brokersFee: [
            { order_id: 1, id: 500, date: "2026-01-01T00:00:00Z", amount: 1200, complete: true },
          ],
        },
      },
    });

    expect(job.build.sale.brokersFee[0]).toBeInstanceOf(BrokerFee);
    expect(job.totalBrokersFees).toBe(1200);
    // The dead completion flag does not survive a read and a write.
    expect(job.toDocument().build.sale.brokersFee).toEqual([
      { order_id: 1, id: 500, date: "2026-01-01T00:00:00Z", amount: 1200 },
    ]);
  });

  it("removes a fee with the order it was charged for", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: {
        sale: {
          marketOrders: [{ order_id: 1, location_id: 60003760 }],
          brokersFee: [{ order_id: 1, amount: 1200 }, { order_id: 2, amount: 800 }],
        },
      },
    });

    job.removeMarketOrder({ order_id: 1, location_id: 60003760 });

    expect(job.totalBrokersFees).toBe(800);
  });
});
