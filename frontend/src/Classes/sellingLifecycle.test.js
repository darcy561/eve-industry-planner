import { describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../tests/queryClients.js";

const characterTransactions = { data: {} };
const characterJournal = { data: {} };
const linkedTrans = new Set();

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        accountID: "acc-1",
        isLoggedIn: false,
        linkedTrans,
        actions: {
          findCharacterByHash: (hash) => ({
            CharacterHash: hash,
            CharacterID: 1,
          }),
        },
      },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  );
});

vi.mock("../Hooks/React Query/Character/useSellingRateInputs", () => ({
  ensureSellingRateInputs: async () => {},
}));
vi.mock("../Hooks/EveEsi/Character/useGetAllCharacterTransactions", () => ({
  getAllCachedCharacterTransactions: () => characterTransactions,
}));
vi.mock("../Hooks/EveEsi/Corporation/useGetAllCorporationTransactions", () => ({
  getAllCachedCorporationTransactions: () => ({ data: {} }),
}));
vi.mock("../Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  getAllCachedCharacterJournal: () => characterJournal,
}));
vi.mock("../Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  getAllCachedCorporationJournal: () => ({ data: {} }),
}));
vi.mock("../Functions/EveESI/World/getStationData", () => ({
  default: async () => ({ race_id: 500001, owner: 1000035 }),
}));
vi.mock("../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  getCachedCharacterSkills: () => ({ data: { 3446: { activeLevel: 5 } } }),
}));
vi.mock("../Hooks/EveEsi/Character/useGetCharacterStandings", () => ({
  getCachedCharacterStandings: () => ({ data: [] }),
}));

const { default: Job } = await import("./job.js");
const { default: calcSellingCharges } =
  await import("../Functions/MarketOrders/calcSellingCharges.js");

const client = () => testQueryClient();
const { default: findBrokersFeeEntry } =
  await import("../Functions/MarketOrders/findBrokersFeeEntry.js");
const { default: findOrderTransactions } =
  await import("../Functions/MarketOrders/findOrderTransactions.js");
const { default: applyLatestOrderData } =
  await import("../Functions/MarketOrders/applyLatestOrderData.js");
const { addMarketOrder, addTransaction, removeMarketOrder } =
  await import("../Components/Edit Job/Edit Job Hooks/jobCommands.js");
const { esiOrderIDs, esiTransactionIDs } =
  await import("../Components/Edit Job/Edit Job Hooks/jobSelectors.js");
const { jobAfterCommands: after } =
  await import("../tests/jobAfterCommands.js");
const {
  averageItemSalePrice,
  totalBrokersFees,
  totalSales,
  totalTransactionFees,
} = await import("../Components/Edit Job/Edit Job Hooks/jobSelectors.js");

const CITADEL = 1035466617946;
const ISSUED = "2026-08-01T00:00:00Z";
const SOLD_AT = "2026-08-03T12:00:00Z";

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

function esiSales() {
  return [
    {
      transaction_id: 700,
      type_id: 587,
      location_id: CITADEL,
      quantity: 60,
      unit_price: 1000000,
      date: SOLD_AT,
      is_personal: true,
    },
    {
      transaction_id: 701,
      type_id: 587,
      location_id: CITADEL,
      quantity: 40,
      unit_price: 1000000,
      date: SOLD_AT,
      is_personal: true,
    },
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

describe("selling a job's output, from listing to a stored document", () => {
  it("keeps every figure in step through the whole sale", async () => {
    linkedTrans.clear();
    let job = newJob();
    const order = esiOrder();

    characterJournal.data = {
      2117000001: [{ id: 55, ref_type: "brokers_fee", date: ISSUED }],
    };
    const charges = await calcSellingCharges(order, client(), 1.5);
    const feeAmount = charges.brokerFee;
    expect(feeAmount).toBe(1500000);

    job = after(
      job,
      addMarketOrder(order, findBrokersFeeEntry(order, charges, null)),
    );

    expect(esiOrderIDs(job.toDocument()).has(900)).toBe(true);
    expect(totalBrokersFees(job.toDocument())).toBe(1500000);
    expect(job.esi.marketOrders["900"].isComplete).toBe(false);
    expect(job.esi.marketOrders["900"].quantitySold).toBe(0);

    const sales = esiSales();
    const took = applyLatestOrderData(job, [
      { ...esiOrder(), volume_remain: 0, issued: SOLD_AT },
    ]);

    expect(took).toBe(true);
    expect(job.esi.marketOrders["900"].isComplete).toBe(true);
    expect(job.esi.marketOrders["900"].quantitySold).toBe(100);

    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: [
        { id: 55, ref_type: "brokers_fee", date: ISSUED },
        ...journalFor(sales),
      ],
    };

    const offered = findOrderTransactions(job.esi, null);

    expect(offered.map((t) => t.transaction_id)).toEqual([700, 701]);
    expect(offered.every((t) => t.isFromMarket)).toBe(true);

    job = after(job, addTransaction(offered));

    expect(esiTransactionIDs(job.toDocument()).size).toBe(2);
    expect(
      Object.values(job.esi.transactions).every((t) => t.belongsToOrder(900)),
    ).toBe(true);

    expect(totalSales(job.toDocument())).toBe(100000000);
    expect(totalTransactionFees(job.toDocument())).toBeCloseTo(3600000, 6);
    expect(totalBrokersFees(job.toDocument())).toBe(1500000);
    expect(averageItemSalePrice(job.toDocument())).toBe(1000000);

    expect(findOrderTransactions(job.esi, null)).toEqual([]);

    const document = job.toDocument();

    expect(Object.keys(document.esi.transactions)).toHaveLength(2);
    expect(document.esi.transactions["700"]).toBeDefined();
    expect(document.esi.transactions["701"]).toBeDefined();

    expect(document.esi.marketOrders["900"].fee).toBe(1500000);
    expect(document.esi.marketOrders["900"].salesTax).toBe(7500000);
    expect(document.esi.marketOrders["900"].feeDate).toBe(ISSUED);
    expect(document.esi.marketOrders["900"]).not.toHaveProperty("complete");
    expect(document.esi.marketOrders["900"].volume_remain).toBe(0);

    const reopened = new Job(document);

    expect(totalSales(reopened.toDocument())).toBe(
      totalSales(job.toDocument()),
    );
    expect(totalTransactionFees(reopened.toDocument())).toBeCloseTo(
      totalTransactionFees(job.toDocument()),
      6,
    );
    expect(totalBrokersFees(reopened.toDocument())).toBe(
      totalBrokersFees(job.toDocument()),
    );
    expect(reopened.esi.marketOrders["900"].isComplete).toBe(true);
  });

  it("takes the order's fee and its sales away together when it is unlinked", async () => {
    linkedTrans.clear();
    let job = newJob();
    const order = esiOrder();
    characterJournal.data = {
      2117000001: [{ id: 55, ref_type: "brokers_fee", date: ISSUED }],
    };

    job = after(
      job,
      addMarketOrder(
        order,
        findBrokersFeeEntry(
          order,
          await calcSellingCharges(order, client(), 1.5),
          null,
        ),
      ),
    );

    const sales = esiSales();
    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: [
        { id: 55, ref_type: "brokers_fee", date: ISSUED },
        ...journalFor(sales),
      ],
    };
    job = after(job, addTransaction(findOrderTransactions(job.esi, null)));

    expect(totalSales(job.toDocument())).toBe(100000000);

    job = after(
      job,
      removeMarketOrder({ order_id: 900, location_id: CITADEL }),
    );

    expect(esiOrderIDs(job.toDocument()).size).toBe(0);
    expect(totalBrokersFees(job.toDocument())).toBe(0);

    expect(totalSales(job.toDocument())).toBe(0);
    expect(esiTransactionIDs(job.toDocument()).size).toBe(0);
  });

  it("offers nothing until the journal has both entries for a sale", async () => {
    linkedTrans.clear();
    let job = newJob();
    const order = esiOrder();
    characterJournal.data = { 2117000001: [] };
    job = after(
      job,
      addMarketOrder(
        order,
        findBrokersFeeEntry(order, { brokerFee: 1500000, salesTax: 0 }, null),
      ),
    );

    const sales = esiSales();
    characterTransactions.data = { "hash-1": sales };
    characterJournal.data = {
      2117000001: journalFor(sales).filter(
        (entry) => entry.ref_type !== "transaction_tax",
      ),
    };

    expect(findOrderTransactions(job.esi, null)).toEqual([]);

    characterJournal.data = { 2117000001: journalFor(sales) };

    expect(findOrderTransactions(job.esi, null)).toHaveLength(2);
  });
});
