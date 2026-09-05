import { describe, expect, it, vi } from "vitest";

const characterTransactions = { data: {} };
const corporationTransactions = { data: {} };
const linkedTrans = new Set();

vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterTransactions", () => ({
  getAllCachedCharacterTransactions: () => characterTransactions,
}));
vi.mock(
  "../../Hooks/EveEsi/Corporation/useGetAllCorporationTransactions",
  () => ({ getAllCachedCorporationTransactions: () => corporationTransactions }),
);
vi.mock("../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: { linkedTrans } }) },
}));

const { default: findTransactionsForMarketOrders } = await import(
  "./findTransactionsForMarketOrders.js"
);

const ORDER = { order_id: 900, location_id: 60003760, type_id: 34 };

function withTransactions(character, corporation = []) {
  characterTransactions.data = { "hash-1": character };
  corporationTransactions.data = corporation.length
    ? { 98000001: corporation }
    : {};
}

function sale(transaction_id, overrides = {}) {
  return {
    transaction_id,
    location_id: ORDER.location_id,
    type_id: ORDER.type_id,
    quantity: 10,
    unit_price: 5,
    ...overrides,
  };
}

function idsFrom(result) {
  return result.map((t) => t.transaction_id);
}

describe("which sales could belong to a market order", () => {
  it("takes sales of the order's item at the order's station", () => {
    linkedTrans.clear();
    withTransactions([sale(1), sale(2)]);

    expect(idsFrom(findTransactionsForMarketOrders(ORDER, null))).toEqual([1, 2]);
  });

  // The same item sold elsewhere, or a different item at the same station, was
  // not sold through this order.
  it("ignores another station and another item", () => {
    linkedTrans.clear();
    withTransactions([
      sale(1, { location_id: 60008494 }),
      sale(2, { type_id: 35 }),
      sale(3),
    ]);

    expect(idsFrom(findTransactionsForMarketOrders(ORDER, null))).toEqual([3]);
  });

  // Linking a sale a second time would count its income twice, on two jobs.
  it("leaves out a sale the account has already linked", () => {
    linkedTrans.clear();
    linkedTrans.add(2);
    withTransactions([sale(1), sale(2)]);

    expect(idsFrom(findTransactionsForMarketOrders(ORDER, null))).toEqual([1]);
  });

  // Unlinking is pending until the job is saved, so a sale on its way out is
  // available again straight away.
  it("offers a linked sale that is being unlinked", () => {
    linkedTrans.clear();
    linkedTrans.add(2);
    withTransactions([sale(1), sale(2)]);

    const result = findTransactionsForMarketOrders(ORDER, null, new Set(), [], [2]);

    expect(idsFrom(result)).toEqual([1, 2]);
  });

  // The same reasoning in the other direction: one being added is spoken for.
  it("leaves out a sale already queued for adding", () => {
    linkedTrans.clear();
    withTransactions([sale(1), sale(2)]);

    const result = findTransactionsForMarketOrders(ORDER, null, new Set(), [2]);

    expect(idsFrom(result)).toEqual([1]);
  });

  it("leaves out a sale another order on this job already matched", () => {
    linkedTrans.clear();
    withTransactions([sale(1), sale(2)]);

    const result = findTransactionsForMarketOrders(ORDER, null, new Set([1]));

    expect(idsFrom(result)).toEqual([2]);
  });

  // A corporation sale is reported on the corporation wallet, and the order it
  // came from is the same order.
  it("reads corporation sales as well as the character's", () => {
    linkedTrans.clear();
    withTransactions([sale(1)], [sale(2, { is_corp: true })]);

    expect(idsFrom(findTransactionsForMarketOrders(ORDER, null))).toEqual([1, 2]);
  });

  it("returns nothing when no sale matches", () => {
    linkedTrans.clear();
    withTransactions([sale(1, { type_id: 35 })]);

    expect(findTransactionsForMarketOrders(ORDER, null)).toEqual([]);
  });
});
