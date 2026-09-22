import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateMock, ensureMock, saleLocations, savedCitadels } = vi.hoisted(
  () => ({
    rateMock: vi.fn(),
    ensureMock: vi.fn(),
    saleLocations: [],
    savedCitadels: { rows: [] },
  }),
);

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: { marketLocations: savedCitadels.rows },
    }),
  );
});

vi.mock("./sellingRates", () => ({
  brokerFeeRate: (saleLocation, ...rest) => {
    saleLocations.push(saleLocation);
    return rateMock(saleLocation, ...rest);
  },
  brokerFeeAmount: (rate, value) => rate * value,
  salesTaxAmount: (rate, value) => rate * value,
  salesTaxWorking: () => ({ rate: 0.02 }),
}));

vi.mock("../../Hooks/React Query/Character/useSellingRateInputs", () => ({
  ensureSellingRateInputs: (...args) => ensureMock(...args),
}));

import calcSellingCharges from "./calcSellingCharges";
import { SALE_LOCATION_KIND } from "./saleLocations";

const JITA = 60003760;
const RAITARU = 1035466617946;

function order(location_id) {
  return {
    location_id,
    price: 100,
    volume_total: 10,
    CharacterHash: "hash-a",
  };
}

beforeEach(() => {
  savedCitadels.rows = [];
  saleLocations.length = 0;
  rateMock.mockReset().mockResolvedValue(0.03);
  ensureMock.mockReset().mockResolvedValue(undefined);
});

// Which of the two the order sat at decides where its broker fee comes from: an NPC station's rate
// is worked out from the seller's skills and standings, while a player structure sets its own and
// the account's stored figure stands in for it.
describe("where a market order's broker fee is charged", () => {
  it("treats an NPC station as a hub, and names the station the rate is read at", async () => {
    await calcSellingCharges(order(JITA), {}, 0.015);

    expect(saleLocations[0]).toEqual({
      kind: SALE_LOCATION_KIND.NPC_STATION,
      feeStationID: JITA,
      brokerFee: null,
    });
  });

  it("treats a player structure as one, and carries the account's fee", async () => {
    await calcSellingCharges(order(RAITARU), {}, 0.015);

    expect(saleLocations[0]).toEqual({
      kind: SALE_LOCATION_KIND.CITADEL,
      feeStationID: null,
      brokerFee: 0.015,
    });
  });

  // 64,000,000 is past the last station id and is unlabelled in EVE's published ranges. It was
  // being charged as a station because the old bound included it.
  it("does not take an id past the station range for a station", async () => {
    await calcSellingCharges(order(64000000), {}, 0.015);

    expect(saleLocations[0].kind).toBe(SALE_LOCATION_KIND.CITADEL);
  });

  it("charges the order's whole value at the rate it was quoted", async () => {
    rateMock.mockResolvedValue(0.05);

    const charges = await calcSellingCharges(order(JITA), {}, 0.015);

    expect(charges.brokerFee).toBeCloseTo(0.05 * 1000);
    expect(charges.salesTax).toBeCloseTo(0.02 * 1000);
  });

  // The seller can be a character no panel on the page has asked about, so the figures it is
  // worked out from are fetched before either charge is calculated.
  it("makes sure the seller's rates are loaded first", async () => {
    await calcSellingCharges(order(JITA), {}, 0.015);

    expect(ensureMock).toHaveBeenCalledWith({}, "hash-a");
  });
});

// The Planning stage quotes the rate a reader recorded for a citadel. The
// Selling stage quoted the account-wide default, so one job showed two fees.
describe("a citadel the reader has saved", () => {
  it("charges the rate recorded for that citadel", async () => {
    savedCitadels.rows = [
      {
        id: "citadelMarket-1",
        structureID: RAITARU,
        brokerFee: 0.032,
      },
    ];

    await calcSellingCharges(order(RAITARU), {}, 0.015);

    expect(saleLocations[0].brokerFee).toBe(0.032);
  });

  // A reader who has not saved the citadel an order sits at still gets a
  // figure, so linking an order never depends on having described where it is.
  it("falls back to the account figure for a citadel it does not hold", async () => {
    savedCitadels.rows = [
      {
        id: "citadelMarket-1",
        structureID: 1234567890,
        brokerFee: 0.032,
      },
    ];

    await calcSellingCharges(order(RAITARU), {}, 0.015);

    expect(saleLocations[0].brokerFee).toBe(0.015);
  });
});
