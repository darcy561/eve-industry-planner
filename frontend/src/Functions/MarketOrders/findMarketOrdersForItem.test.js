import { describe, expect, it, vi } from "vitest";

const characterOrders = { data: {} };
const characterHistoric = { data: {} };
const corporationOrders = { data: {} };
const corporationHistoric = { data: {} };
const linkedOrders = new Set();

vi.mock("../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: { linkedOrders } }) },
}));
vi.mock("../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders", () => ({
  getAllCachedCharacterMarketOrders: () => characterOrders,
}));
vi.mock(
  "../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders",
  () => ({ getAllCachedCharacterHistoricMarketOrders: () => characterHistoric }),
);
vi.mock("../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders", () => ({
  getAllCachedCorporationMarketOrders: () => corporationOrders,
}));
vi.mock(
  "../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders",
  () => ({
    getAllCachedCorporationHistoricMarketOrders: () => corporationHistoric,
  }),
);

const { default: findMarketOrdersForItem } = await import(
  "./findMarketOrdersForItem.js"
);

const JOB = { itemID: 587 };

function order(order_id, overrides = {}) {
  return {
    order_id,
    type_id: 587,
    location_id: 60003760,
    price: 1000000,
    volume_total: 100,
    volume_remain: 40,
    ...overrides,
  };
}

function withOrders({ character = [], historic = [], corp = [], corpHistoric = [] } = {}) {
  characterOrders.data = { "hash-1": character };
  characterHistoric.data = { "hash-1": historic };
  corporationOrders.data = corp.length ? { 98000001: corp } : {};
  corporationHistoric.data = corpHistoric.length ? { 98000001: corpHistoric } : {};
  linkedOrders.clear();
}

const ids = (orders) => orders.map((o) => o.order_id);

describe("the market orders a job can link", () => {
  it("offers orders listing this job's item", () => {
    withOrders({ character: [order(900), order(901, { type_id: 34 })] });

    expect(ids(findMarketOrdersForItem(null, JOB))).toEqual([900]);
  });

  it("offers historic orders alongside live ones", () => {
    withOrders({ character: [order(900)], historic: [order(901)] });

    expect(ids(findMarketOrdersForItem(null, JOB))).toEqual([900, 901]);
  });

  it("does not offer an order already linked to a job", () => {
    withOrders({ character: [order(900), order(901)] });
    linkedOrders.add(900);

    expect(ids(findMarketOrdersForItem(null, JOB))).toEqual([901]);
  });

  // Unlinking is pending until the job saves, so an order on its way out is
  // available again straight away.
  it("offers a linked order that is being unlinked", () => {
    withOrders({ character: [order(900)] });
    linkedOrders.add(900);

    expect(ids(findMarketOrdersForItem(null, JOB, [], [900]))).toEqual([900]);
  });

  it("does not offer an order already queued for adding", () => {
    withOrders({ character: [order(900), order(901)] });

    expect(ids(findMarketOrdersForItem(null, JOB, [900]))).toEqual([901]);
  });

  // The same order is reported on the character wallet and the corporation
  // wallet; the corporation's reading owns it, whichever arrives first.
  it("keeps the corporation's reading of an order it also sees as a character's", () => {
    withOrders({
      character: [order(900, { volume_remain: 40 })],
      corp: [order(900, { is_corporation: true, volume_remain: 12 })],
    });

    const offered = findMarketOrdersForItem(null, JOB);

    expect(offered).toHaveLength(1);
    expect(offered[0].is_corporation).toBe(true);
    expect(offered[0].volume_remain).toBe(12);
  });

  it("keeps the corporation's reading when it is reported first", () => {
    withOrders({
      corp: [order(900, { is_corporation: true, volume_remain: 12 })],
      historic: [order(900, { volume_remain: 40 })],
    });

    const offered = findMarketOrdersForItem(null, JOB);

    expect(offered).toHaveLength(1);
    expect(offered[0].volume_remain).toBe(12);
  });

  // An order that has just closed sits in the live list and the historic list
  // at once, and both are the character's — the reason it was offered twice.
  it("offers an order once when it is in both the live and historic lists", () => {
    withOrders({
      character: [order(900, { volume_remain: 0 })],
      historic: [order(900, { volume_remain: 0, state: "expired" })],
    });

    expect(ids(findMarketOrdersForItem(null, JOB))).toEqual([900]);
  });

  it("offers a corporation order once across its two lists", () => {
    withOrders({
      corp: [order(900, { is_corporation: true })],
      corpHistoric: [order(900, { is_corporation: true, state: "expired" })],
    });

    expect(ids(findMarketOrdersForItem(null, JOB))).toEqual([900]);
  });

  it("offers nothing when no order lists the item", () => {
    withOrders({ character: [order(900, { type_id: 34 })] });

    expect(findMarketOrdersForItem(null, JOB)).toEqual([]);
  });
});
