import { describe, expect, it, vi } from "vitest";

const characterTransactions = { data: {} };
const characterJournal = { data: {} };
const linkedTrans = new Set();

vi.mock("../src/Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false, linkedTrans },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetAllCharacterTransactions", () => ({
  getAllCachedCharacterTransactions: () => characterTransactions,
}));
vi.mock("../src/Hooks/EveEsi/Corporation/useGetAllCorporationTransactions", () => ({
  getAllCachedCorporationTransactions: () => ({ data: {} }),
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => characterJournal,
}));
vi.mock("../src/Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => ({ data: {} }),
}));
vi.mock("../src/Functions/EveESI/World/getStationData", () => ({
  default: async () => ({ race_id: 500001, owner: 1000035 }),
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  getCachedCharacterSkills: () => ({ data: { 3446: { activeLevel: 5 } } }),
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetCharacterStandings", () => ({
  getCachedCharacterStandings: () => ({ data: [] }),
}));

const { default: Job } = await import("../src/Classes/job.js");
const { default: calcBrokersFee } = await import(
  "../src/Functions/MarketOrders/calcBrokersFee.js"
);
const { default: findBrokersFeeEntry } = await import(
  "../src/Functions/MarketOrders/findBrokersFeeEntry.js"
);
const { default: findOrderTransactions } = await import(
  "../src/Functions/MarketOrders/findOrderTransactions.js"
);
const { default: applyLatestOrderData } = await import(
  "../src/Functions/MarketOrders/applyLatestOrderData.js"
);

const CITADEL = 1035466617946;
const ISSUED = "2026-08-01T00:00:00Z";
const SOLD_AT = "2026-08-03T12:00:00Z";

// The order as ESI reports it: 100 units listed at 1,000,000 ISK.
function esiOrder(overrides = {}) {
  return {
    order_id: 900,
    type_id: 587,
    location_id: CITADEL,
    region_id: 10000002,
    range: "region",
    duration: 90,
    price: 1000000,
    volume_total: 100,
    volume_remain: 100,
    issued: ISSUED,
    is_corporation: false,
    CharacterHash: "hash-1",
    ...overrides,
  };
}

// Two fills of that order, with the journal entries that carry the money.
function esiSales() {
  return [
    { transaction_id: 700, type_id: 587, location_id: CITADEL, quantity: 60, unit_price: 1000000, date: SOLD_AT, is_personal: true },
    { transaction_id: 701, type_id: 587, location_id: CITADEL, quantity: 40, unit_price: 1000000, date: SOLD_AT, is_personal: true },
  ];
}

function journalFor(sales) {
  return sales.flatMap(({ transaction_id, quantity, unit_price }) => {
    const amount = quantity * unit_price;
    return [
      {
        id: transaction_id * 10,
        ref_type: "market_transaction",
        context_id_type: "market_transaction_id",
        context_id: transaction_id,
        amount,
        description: "Market: Oxygen Fuel Block bought",
        date: SOLD_AT,
      },
      {
        id: transaction_id * 10 + 1,
        ref_type: "transaction_tax",
        context_id_type: "market_transaction_id",
        context_id: transaction_id,
        amount: -(amount * 0.036),
        date: SOLD_AT,
      },
    ];
  });
}

function newJob() {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Oxygen Fuel Block",
  });
}

// A job walked through selling as a real one goes: list the output, take the
// fee, watch the order fill, link each sale, and read what the job made.
describe("selling a job's output, from listing to a stored document", () => {
  it("keeps every figure in step through the whole sale", async () => {
    linkedTrans.clear();
    const job = newJob();
    const order = esiOrder();

    // 1. Listing the order charges a broker fee, worked out for this order
    //    rather than read from a journal entry that may cover several.
    characterJournal.data = {
      2117000001: [{ id: 55, ref_type: "brokers_fee", date: ISSUED }],
    };
    const feeAmount = await calcBrokersFee(order, null, 1.5);
    expect(feeAmount).toBe(1500000); // 1.5% of 100,000,000

    job.addMarketOrder(order, findBrokersFeeEntry(order, feeAmount, null));

    expect(job.esiOrderIDs.has(900)).toBe(true);
    expect(job.totalBrokersFees).toBe(1500000);
    expect(job.build.sale.marketOrders[0].isComplete).toBe(false);
    expect(job.build.sale.marketOrders[0].quantitySold).toBe(0);

    // 2. ESI reports the order filling. The row takes it and says so.
    const sales = esiSales();
    const took = applyLatestOrderData(job, [
      { ...esiOrder(), volume_remain: 0, issued: SOLD_AT },
    ]);

    expect(took).toBe(true);
    expect(job.build.sale.marketOrders[0].isComplete).toBe(true);
    expect(job.build.sale.marketOrders[0].quantitySold).toBe(100);

    // 3. The wallet reports the two fills, and the journal carries the money
    //    and the tax for each.
    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: [
        { id: 55, ref_type: "brokers_fee", date: ISSUED },
        ...journalFor(sales),
      ],
    };

    const offered = findOrderTransactions(job, null);

    expect(offered.map((t) => t.transaction_id)).toEqual([700, 701]);
    expect(offered.every((t) => t.isFromMarket)).toBe(true);

    // 4. Linking them attributes each sale to the order it came through.
    job.addTransaction(offered, 900);

    expect(job.esiTransactionIDs.size).toBe(2);
    expect(job.build.sale.transactions.every((t) => t.belongsToOrder(900))).toBe(
      true,
    );

    // 5. What the job made: 100,000,000 of sales, 3.6% tax, and the listing fee.
    expect(job.totalSales).toBe(100000000);
    expect(job.totalTransactionFees).toBeCloseTo(3600000, 6);
    expect(job.totalBrokersFees).toBe(1500000);
    expect(job.averageItemSalePrice()).toBe(1000000);

    // 6. A sale already linked is not offered a second time.
    expect(findOrderTransactions(job, null)).toEqual([]);

    // 7. The document carries the rows, and nothing derived.
    const document = job.toDocument();

    expect(document.build.sale.transactions).toHaveLength(2);
    expect(document.build.sale.brokersFee).toEqual([
      { order_id: 900, id: 55, date: ISSUED, amount: 1500000 },
    ]);
    expect(document.build.sale.marketOrders[0]).not.toHaveProperty("complete");
    expect(document.build.sale.marketOrders[0].volume_remain).toBe(0);

    // 8. Reading it back gives the same figures.
    const reopened = new Job(document);

    expect(reopened.totalSales).toBe(job.totalSales);
    expect(reopened.totalTransactionFees).toBeCloseTo(job.totalTransactionFees, 6);
    expect(reopened.totalBrokersFees).toBe(job.totalBrokersFees);
    expect(reopened.build.sale.marketOrders[0].isComplete).toBe(true);
  });

  it("takes the order's fee and its sales away together when it is unlinked", async () => {
    linkedTrans.clear();
    const job = newJob();
    const order = esiOrder();
    characterJournal.data = {
      2117000001: [{ id: 55, ref_type: "brokers_fee", date: ISSUED }],
    };

    job.addMarketOrder(
      order,
      findBrokersFeeEntry(order, await calcBrokersFee(order, null, 1.5), null),
    );

    const sales = esiSales();
    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: [
        { id: 55, ref_type: "brokers_fee", date: ISSUED },
        ...journalFor(sales),
      ],
    };
    job.addTransaction(findOrderTransactions(job, null), 900);

    expect(job.totalSales).toBe(100000000);

    job.removeMarketOrder({ order_id: 900, location_id: CITADEL });

    expect(job.esiOrderIDs.size).toBe(0);
    expect(job.totalBrokersFees).toBe(0);
    // The sales came through that order, at that station, so they go with it.
    expect(job.totalSales).toBe(0);
    expect(job.esiTransactionIDs.size).toBe(0);
  });

  // A sale the journal has not caught up with is not offered, so the job cannot
  // store a blank description or a tax of zero.
  it("offers nothing until the journal has both entries for a sale", async () => {
    linkedTrans.clear();
    const job = newJob();
    const order = esiOrder();
    characterJournal.data = { 2117000001: [] };
    job.addMarketOrder(order, findBrokersFeeEntry(order, 1500000, null));

    const sales = esiSales();
    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: journalFor(sales).filter(
        (entry) => entry.ref_type !== "transaction_tax",
      ),
    };

    expect(findOrderTransactions(job, null)).toEqual([]);

    characterJournal.data = { 2117000001: journalFor(sales) };

    expect(findOrderTransactions(job, null)).toHaveLength(2);
  });
});
