import { describe, expect, it, vi } from "vitest";

const characterTransactions = { data: {} };
const corporationTransactions = { data: {} };
const characterJournal = { data: {} };
const linkedTrans = new Set();

vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterTransactions", () => ({
  getAllCachedCharacterTransactions: () => characterTransactions,
}));
vi.mock(
  "../../Hooks/EveEsi/Corporation/useGetAllCorporationTransactions",
  () => ({ getAllCachedCorporationTransactions: () => corporationTransactions }),
);
vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => characterJournal,
}));
vi.mock("../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => ({ data: {} }),
}));
vi.mock("../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: { linkedTrans } }) },
}));

const { default: findOrderTransactions } = await import(
  "./findOrderTransactions.js"
);

const SOLD_AT = "2026-08-01T12:00:00Z";

function sale(transaction_id, location_id) {
  return {
    transaction_id,
    location_id,
    type_id: 34,
    quantity: 10,
    unit_price: 5,
    date: SOLD_AT,
  };
}

// Both entries, so the sale is complete enough to be offered.
function journalFor(ids) {
  return ids.flatMap((id) => [
    {
      id: id * 10,
      ref_type: "market_transaction",
      context_id_type: "market_transaction_id",
      context_id: id,
      amount: 50,
      description: "Market: Tritanium bought",
      date: SOLD_AT,
    },
    {
      id: id * 10 + 1,
      ref_type: "transaction_tax",
      context_id_type: "market_transaction_id",
      context_id: id,
      amount: -1.8,
      date: SOLD_AT,
    },
  ]);
}

function jobWithOrders(orders) {
  return {
    esiTransactionIDs: new Set(),
    build: { sale: { marketOrders: orders } },
  };
}

describe("the sales a job can link", () => {
  // Two orders at the same station sell the same item, so both see the same
  // candidates — counting a sale once per order would double the job's income.
  it("offers each sale once across several orders at one station", () => {
    linkedTrans.clear();
    characterTransactions.data = { "hash-1": [sale(1, 60003760), sale(2, 60003760)] };
    corporationTransactions.data = {};
    characterJournal.data = { 2117000001: journalFor([1, 2]) };

    const offered = findOrderTransactions(
      jobWithOrders([
        { order_id: 900, location_id: 60003760, type_id: 34, CharacterHash: "hash-1" },
        { order_id: 901, location_id: 60003760, type_id: 34, CharacterHash: "hash-1" },
      ]),
      null,
    );

    expect(offered.map((t) => t.transaction_id)).toEqual([1, 2]);
  });

  // A sale this job already holds is not on offer again.
  it("skips what the job has already linked", () => {
    linkedTrans.clear();
    characterTransactions.data = { "hash-1": [sale(1, 60003760), sale(2, 60003760)] };
    corporationTransactions.data = {};
    characterJournal.data = { 2117000001: journalFor([1, 2]) };

    const job = jobWithOrders([
      { order_id: 900, location_id: 60003760, type_id: 34, CharacterHash: "hash-1" },
    ]);
    job.esiTransactionIDs = new Set([1]);

    const offered = findOrderTransactions(job, null);

    expect(offered.map((t) => t.transaction_id)).toEqual([2]);
  });

  it("carries the money, the tax and the seller onto each row", () => {
    linkedTrans.clear();
    characterTransactions.data = { "hash-1": [sale(1, 60003760)] };
    corporationTransactions.data = {};
    characterJournal.data = { 2117000001: journalFor([1]) };

    const [offered] = findOrderTransactions(
      jobWithOrders([
        { order_id: 900, location_id: 60003760, type_id: 34, CharacterHash: "hash-1" },
      ]),
      null,
    );

    expect(offered.amount).toBe(50);
    expect(offered.tax).toBe(1.8);
    expect(offered.description).toBe("Tritanium");
    expect(offered.CharacterHash).toBe("hash-1");
  });

  it("offers nothing when the job has no linked orders", () => {
    linkedTrans.clear();
    characterTransactions.data = { "hash-1": [sale(1, 60003760)] };
    characterJournal.data = { 2117000001: journalFor([1]) };

    expect(findOrderTransactions(jobWithOrders([]), null)).toEqual([]);
  });
});
