import { describe, it, expect } from "vitest";
import { sellingFeesFrom, signedOutSellingFees } from "./sellingFees";
import { SALE_LOCATION_KIND } from "../../MarketOrders/saleLocations";

const STATION = {
  kind: SALE_LOCATION_KIND.NPC_STATION,
  id: "jita",
  name: "Jita IV - Moon 4",
  feeStationID: 60003760,
  brokerFee: null,
};

describe("sellingFeesFrom", () => {
  it("charges the broker fee and the sales tax together", () => {
    expect(sellingFeesFrom({ brokerFee: 1.2, salesTax: 3 })).toEqual({
      brokerFee: 1.2,
      salesTax: 3,
      feePercent: 4.2,
    });
  });
});

describe("signedOutSellingFees", () => {
  it("quotes a station at every market skill's highest level with no standings", () => {
    const fees = signedOutSellingFees(STATION);

    expect(fees.brokerFee).toBeCloseTo(1.5, 10);
    expect(fees.salesTax).toBeCloseTo(3.375, 10);
    expect(fees.feePercent).toBeCloseTo(4.875, 10);
  });

  it("takes a citadel owner's own broker fee, which no skill reduces", () => {
    const fees = signedOutSellingFees({
      kind: SALE_LOCATION_KIND.CITADEL,
      id: "citadel",
      name: "A citadel",
      feeStationID: null,
      brokerFee: 2,
    });

    expect(fees.brokerFee).toBe(2);
    expect(fees.feePercent).toBeCloseTo(5.375, 10);
  });

  it("quotes the station default where no location resolved", () => {
    expect(signedOutSellingFees(null).feePercent).toBeCloseTo(4.875, 10);
  });
});
