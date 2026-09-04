import { describe, expect, it, vi } from "vitest";

const characterJournal = { data: {} };
const corporationJournal = { data: {} };

vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => characterJournal,
}));
vi.mock("../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => corporationJournal,
}));
vi.mock("./findTransactionsForMarketOrders", () => ({
  default: () => availableTransactions,
}));

let availableTransactions = [];

const { default: findJournalEntriesFromTransaction } = await import(
  "./findJournalEntriesFromTransaction.js"
);
const { default: findBrokersFeeEntry } = await import(
  "./findBrokersFeeEntry.js"
);

function withJournal(entries) {
  characterJournal.data = { 2117000001: entries };
  corporationJournal.data = {};
}

const SOLD_AT = "2026-08-01T12:00:00Z";

describe("the journal entries behind a sale", () => {
  it("finds the money and the tax by the transaction they name", () => {
    withJournal([
      {
        id: 1,
        ref_type: "market_transaction",
        context_id_type: "market_transaction_id",
        context_id: 700,
        amount: 500,
        date: SOLD_AT,
      },
      {
        id: 2,
        ref_type: "transaction_tax",
        context_id_type: "market_transaction_id",
        context_id: 700,
        amount: -18,
        date: SOLD_AT,
      },
    ]);

    const { journalEntry, transactionTax } = findJournalEntriesFromTransaction(
      { transaction_id: 700, date: SOLD_AT },
      null,
    );

    expect(journalEntry.amount).toBe(500);
    expect(transactionTax.amount).toBe(-18);
  });

  // One order filling in several transactions puts them in the same second, so
  // a timestamp alone cannot say which tax belongs to which sale.
  it("does not take the tax charged on another sale in the same second", () => {
    withJournal([
      {
        id: 2,
        ref_type: "transaction_tax",
        context_id_type: "market_transaction_id",
        context_id: 701,
        amount: -18,
        date: SOLD_AT,
      },
    ]);

    const { transactionTax } = findJournalEntriesFromTransaction(
      { transaction_id: 700, date: SOLD_AT },
      null,
    );

    expect(transactionTax).toBeUndefined();
  });

  // The typed match is an addition to matching on the id, never a narrowing:
  // an entry naming this transaction is taken whatever else it says.
  it("still finds an entry whose context type is not the expected one", () => {
    withJournal([
      {
        id: 1,
        ref_type: "market_transaction",
        context_id_type: "station_id",
        context_id: 700,
        amount: 500,
        date: SOLD_AT,
      },
    ]);

    const { journalEntry } = findJournalEntriesFromTransaction(
      { transaction_id: 700, date: SOLD_AT },
      null,
    );

    expect(journalEntry.amount).toBe(500);
  });

  // Older cached entries were stored before the context was kept.
  it("falls back to the timestamp when an entry names no transaction", () => {
    withJournal([
      { id: 2, ref_type: "transaction_tax", amount: -18, date: SOLD_AT },
    ]);

    const { transactionTax } = findJournalEntriesFromTransaction(
      { transaction_id: 700, date: SOLD_AT },
      null,
    );

    expect(transactionTax.amount).toBe(-18);
  });
});

describe("the broker fee charged for an order", () => {
  const order = { order_id: 1, issued: SOLD_AT, CharacterHash: "hash-1" };

  it("takes the fee charged when the order was listed", () => {
    withJournal([
      { id: 10, ref_type: "brokers_fee", date: "2026-07-01T00:00:00Z" },
      { id: 11, ref_type: "brokers_fee", date: SOLD_AT },
    ]);

    const fee = findBrokersFeeEntry(order, 1200, null);

    expect(fee.id).toBe(11);
    expect(fee.amount).toBe(1200);
    expect(fee.order_id).toBe(1);
  });

  // The journal is a separate endpoint and can lag the orders, but the fee was
  // worked out here rather than read from it, so it is still known.
  it("records the computed fee when the journal has no entry yet", () => {
    withJournal([
      { id: 10, ref_type: "brokers_fee", date: "2026-07-01T00:00:00Z" },
    ]);

    const fee = findBrokersFeeEntry(order, 1200, null);

    expect(fee.amount).toBe(1200);
    expect(fee.id).toBeNull();
    // Dated by the listing, so it is filed in the month it was charged.
    expect(fee.date).toBe(SOLD_AT);
  });

  // Multi-sell charges several orders in one entry, so two orders listed
  // together share its id and each keeps its own worked-out amount.
  it("gives orders listed together their own amounts from a shared entry", () => {
    withJournal([{ id: 11, ref_type: "brokers_fee", date: SOLD_AT }]);

    const first = findBrokersFeeEntry(order, 1200, null);
    const second = findBrokersFeeEntry({ ...order, order_id: 2 }, 800, null);

    expect(first.id).toBe(11);
    expect(second.id).toBe(11);
    expect(first.amount).toBe(1200);
    expect(second.amount).toBe(800);
    expect(second.order_id).toBe(2);
  });

  it("ignores an entry that is not a broker fee", () => {
    withJournal([
      { id: 12, ref_type: "market_transaction", date: SOLD_AT, amount: 500 },
    ]);

    expect(findBrokersFeeEntry(order, 1200, null).id).toBeNull();
  });
});

describe("which sales are offered for linking", () => {
  // The panel renders the description, the money and the tax, and stores what
  // it renders — so an incomplete row would be linked with figures the account
  // never supplied.
  it("offers nothing until the journal has both entries", async () => {
    const { default: findOrderTransactions } = await import(
      "./findOrderTransactions.js"
    );

    const job = {
      esiTransactionIDs: new Set(),
      build: {
        sale: {
          marketOrders: [
            { order_id: 900, type_id: 34, location_id: 60003760, CharacterHash: "hash-1" },
          ],
        },
      },
    };

    availableTransactions = [
      { transaction_id: 700, date: SOLD_AT, quantity: 10, unit_price: 5 },
    ];

    // Money recorded, tax not yet: the row would store no tax at all.
    withJournal([
      {
        id: 1,
        ref_type: "market_transaction",
        context_id_type: "market_transaction_id",
        context_id: 700,
        amount: 500,
        description: "Market: Tritanium bought",
        date: SOLD_AT,
      },
    ]);

    expect(findOrderTransactions(job, null)).toEqual([]);

    // Both entries present: the row is complete and can be offered.
    withJournal([
      {
        id: 1,
        ref_type: "market_transaction",
        context_id_type: "market_transaction_id",
        context_id: 700,
        amount: 500,
        description: "Market: Tritanium bought",
        date: SOLD_AT,
      },
      {
        id: 2,
        ref_type: "transaction_tax",
        context_id_type: "market_transaction_id",
        context_id: 700,
        amount: -18,
        date: SOLD_AT,
      },
    ]);

    const [offered] = findOrderTransactions(job, null);
    expect(offered.amount).toBe(500);
    expect(offered.tax).toBe(18);
    // "Market: " and everything from " bought" are the journal's wording, not
    // the item's name.
    expect(offered.description).toBe("Tritanium");
  });
});
