import {
  buildCost,
  esiOrderIDs,
  estimatedSalesTaxOutstanding,
  totalBrokersFees,
  totalCost,
  totalTransactionFees,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { describe, expect, it } from "vitest";

import BrokerFee from "./brokerFee";
import MarketOrder from "./marketOrder";
import Transaction from "./transaction";
import Job from "./job";
import InventionEntry from "./inventionEntry";
import {
  addMarketOrder,
  addTransaction,
  removeMarketOrder,
} from "../Components/Edit Job/Edit Job Hooks/jobCommands";
import { jobAfterCommands } from "../tests/jobAfterCommands";

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

  it("mints a hand-entered id below zero, inside the safe range", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const minted = Transaction.mintCustomID();

      expect(minted).toBeLessThan(0);
      expect(Number.isSafeInteger(minted)).toBe(true);

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
      {
        order_id: 1,
        price: 250,
        issued: "2026-01-01T00:00:00Z",
        volume_total: 10,
      },
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
      fee: 0,
      salesTax: 0,
      feeDate: null,
    });
  });

  describe("recording the broker fee charged for listing it", () => {
    const dated = (amount, date) => ({ amount, salesTax: 0, date });

    it("keeps the earlier of two fees naming one order", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(1000, "2026-01-01T00:00:00Z"));
      order.recordBrokerFee(dated(9999, "2026-02-01T00:00:00Z"));

      expect(order.fee).toBe(1000);
      expect(order.feeDate).toBe("2026-01-01T00:00:00Z");
    });

    it("takes a later-read fee that was charged earlier", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(9999, "2026-02-01T00:00:00Z"));
      order.recordBrokerFee(dated(1000, "2026-01-01T00:00:00Z"));

      expect(order.fee).toBe(1000);
    });

    it("does not let an undated fee displace a dated one", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(1000, "2026-01-01T00:00:00Z"));
      order.recordBrokerFee(dated(9999, null));

      expect(order.fee).toBe(1000);
      expect(order.feeDate).toBe("2026-01-01T00:00:00Z");
    });

    it("takes an undated fee when the order carries none", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(1000, null));

      expect(order.fee).toBe(1000);
      expect(order.feeDate).toBeNull();
    });

    it("keeps the first of two undated fees", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(1000, null));
      order.recordBrokerFee(dated(9999, null));

      expect(order.fee).toBe(1000);
    });

    it("keeps a recorded fee of nothing", () => {
      const order = new MarketOrder({ order_id: 1 });

      order.recordBrokerFee(dated(0, null));
      order.recordBrokerFee(dated(500, null));

      expect(order.fee).toBe(0);
    });
  });

  it("reads completion from what is left rather than a stored flag", () => {
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 0 }).isComplete,
    ).toBe(true);
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4 }).isComplete,
    ).toBe(false);
  });

  it("counts an expired or cancelled order as finished", () => {
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4, state: "expired" })
        .isComplete,
    ).toBe(true);
    expect(
      new MarketOrder({
        volume_total: 10,
        volume_remain: 4,
        state: "cancelled",
      }).isComplete,
    ).toBe(true);
    expect(
      new MarketOrder({ volume_total: 10, volume_remain: 4, state: "open" })
        .isComplete,
    ).toBe(false);
  });

  it("says how much has sold and how much is still listed", () => {
    const order = new MarketOrder({
      volume_total: 10,
      volume_remain: 4,
      item_price: 100,
    });

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

  it("leaves a sold out order alone", () => {
    const order = new MarketOrder({
      volume_total: 10,
      volume_remain: 0,
      item_price: 100,
    });

    expect(order.applyLatest({ price: 50, volume_remain: 5 })).toBe(false);
    expect(order.item_price).toBe(100);
  });

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

    expect(fee.amount).toBe(1200);
    expect(fee.date).toBe("2026-01-01T00:00:00Z");
  });

  it("keeps every stored key on the way out", () => {
    const row = {
      order_id: 1,
      id: 500,
      date: "2026-01-01T00:00:00Z",
      amount: 1200,
      salesTax: 90,
    };

    expect(new BrokerFee(row).toDocument()).toEqual(row);
  });

  it("carries no estimate for a row stored without one", () => {
    expect(new BrokerFee({ order_id: 1, amount: 1200 }).salesTax).toBe(0);
  });
});

describe("linking a market order", () => {
  it("keeps the order when no broker fee entry was found", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });

    const listed = jobAfterCommands(
      job,
      addMarketOrder({ order_id: 1, price: 5, volume_total: 10 }, null),
    );

    expect(esiOrderIDs(listed.toDocument()).has(1)).toBe(true);

    expect(listed.esi.marketOrders["1"].fee).toBe(0);
    expect(listed.esi.marketOrders["1"].feeDate).toBeNull();
    expect(totalBrokersFees(listed.toDocument())).toBe(0);
  });

  it("records the fee alongside the order when there is one", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
    });

    const listed = jobAfterCommands(
      job,
      addMarketOrder(
        { order_id: 1, price: 5, volume_total: 10 },
        { order_id: 1, id: 500, amount: 1200 },
      ),
    );

    expect(esiOrderIDs(listed.toDocument()).has(1)).toBe(true);
    expect(totalBrokersFees(listed.toDocument())).toBe(1200);

    expect(listed.esi.marketOrders["1"].fee).toBe(1200);
  });

  it("holds a stored fee on its order and writes it back", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: {
        sale: {
          marketOrders: [{ order_id: 1 }],
          brokersFee: [
            {
              order_id: 1,
              id: 500,
              date: "2026-01-01T00:00:00Z",
              amount: 1200,
              complete: true,
            },
          ],
        },
      },
    });

    expect(job.esi.marketOrders["1"].fee).toBe(1200);
    expect(job.esi.marketOrders["1"].feeDate).toBe("2026-01-01T00:00:00Z");
    expect(totalBrokersFees(job.toDocument())).toBe(1200);

    const document = job.toDocument();
    expect(document.esi.marketOrders["1"]).not.toHaveProperty("complete");
    expect(document.esi.marketOrders["1"].fee).toBe(1200);
    expect(totalBrokersFees(new Job(document).toDocument())).toBe(1200);
  });

  it("removes a fee with the order it was charged for", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: {
        sale: {
          marketOrders: [
            { order_id: 1, location_id: 60003760 },
            { order_id: 2, location_id: 60003760 },
          ],
          brokersFee: [
            { order_id: 1, amount: 1200 },
            { order_id: 2, amount: 800 },
          ],
        },
      },
    });

    const unlisted = jobAfterCommands(
      job,
      removeMarketOrder({ order_id: 1, location_id: 60003760 }),
    );

    expect(totalBrokersFees(unlisted.toDocument())).toBe(800);
  });
});

describe("which order a linked sale is attributed to", () => {
  const jobSellingThrough = (orders) =>
    new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: { materials: {}, sale: { marketOrders: orders } },
    });

  it("attributes the sale to the job's only order", () => {
    const job = jobSellingThrough([{ order_id: 700001, price: 5 }]);

    const sold = jobAfterCommands(
      job,
      addTransaction({ transaction_id: 800001, quantity: 1, amount: 10 }),
    );

    expect(sold.esi.transactions["800001"].order_id).toBe(700001);
  });

  it("leaves the sale unattributed when the job sells through several", () => {
    const job = jobSellingThrough([
      { order_id: 700001, price: 5 },
      { order_id: 700002, price: 6 },
    ]);

    const sold = jobAfterCommands(
      job,
      addTransaction({ transaction_id: 800001, quantity: 1, amount: 10 }),
    );

    expect(sold.esi.transactions["800001"].order_id).toBeNull();
  });

  it("takes a sale on a job with no orders at all", () => {
    const job = jobSellingThrough([]);

    const sold = jobAfterCommands(
      job,
      addTransaction({ transaction_id: 800001, quantity: 1, amount: 10 }),
    );

    expect(Object.keys(sold.esi.transactions)).toHaveLength(1);
    expect(sold.esi.transactions["800001"].order_id).toBeNull();
  });
});

describe("tax expected on orders that have not sold", () => {
  const jobWith = ({ fees = [], transactions = [] }) =>
    new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      name: "Tritanium",
      build: {
        materials: {},
        sale: {
          marketOrders: fees.map((fee) => ({ order_id: fee.order_id })),
          brokersFee: fees,
          transactions,
        },
      },
    });

  it("counts the estimate for an order with no transaction yet", () => {
    const job = jobWith({
      fees: [{ order_id: 1, amount: 1200, salesTax: 500 }],
    });

    expect(estimatedSalesTaxOutstanding(job.toDocument())).toBe(500);
  });

  it("stops counting it once the order has sold", () => {
    const job = jobWith({
      fees: [{ order_id: 1, amount: 1200, salesTax: 500 }],
      transactions: [{ order_id: 1, transaction_id: 9, tax: 480, amount: 100 }],
    });

    expect(estimatedSalesTaxOutstanding(job.toDocument())).toBe(0);

    expect(totalTransactionFees(job.toDocument())).toBe(480);
  });

  it("counts only the orders still open when some have sold", () => {
    const job = jobWith({
      fees: [
        { order_id: 1, amount: 1200, salesTax: 500 },
        { order_id: 2, amount: 800, salesTax: 300 },
      ],
      transactions: [{ order_id: 1, transaction_id: 9, tax: 480, amount: 100 }],
    });

    expect(estimatedSalesTaxOutstanding(job.toDocument())).toBe(300);
  });

  it("stays out of the job's total cost", () => {
    const job = jobWith({
      fees: [{ order_id: 1, amount: 1200, salesTax: 500 }],
    });

    expect(totalCost(job)).toBe(buildCost(job) + 1200);
  });

  it("counts nothing for rows stored before estimates existed", () => {
    const job = jobWith({ fees: [{ order_id: 1, amount: 1200 }] });

    expect(estimatedSalesTaxOutstanding(job.toDocument())).toBe(0);
  });
});

describe("what meta group a job belongs to", () => {
  it("takes it from the recipe it was built from", () => {
    const job = new Job({ jobType: 1, name: "Item", metaGroupID: 2 });

    expect(job.metaLevel).toBe(2);
  });

  it("takes it from a stored job's own field", () => {
    const job = new Job({ jobType: 1, name: "Item", metaLevel: 14 });

    expect(job.metaLevel).toBe(14);
  });

  it("carries it back into the document", () => {
    const job = new Job({ jobType: 1, name: "Item", metaGroupID: 53 });

    expect(job.toDocument().metaLevel).toBe(53);
  });

  it("has none for an item that belongs to no meta group", () => {
    expect(new Job({ jobType: 1, name: "Item" }).metaLevel).toBeNull();
  });
});

describe("minting an invention entry's id", () => {
  it("gives two entries made together ids of their own", () => {
    const first = InventionEntry.forItem("Datacore", 100);
    const second = InventionEntry.forItem("Decryptor", 200);

    expect(first.id).not.toBe(second.id);
  });

  it("mints a different id every time", () => {
    const ids = [1, 2, 3, 4, 5].map(() => InventionEntry.mintID());

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a numeric id a stored row already has", () => {
    const entry = new InventionEntry({ id: 1789083363901, itemName: "Old" });

    expect(entry.id).toBe(1789083363901);
    expect(entry.toDocument().id).toBe(1789083363901);
  });
});
