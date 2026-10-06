import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { SALE_LOCATION_KIND } from "../../../Functions/MarketOrders/saleLocations";

const { useSellingRates } = vi.hoisted(() => ({ useSellingRates: vi.fn() }));
const STATION = {
  kind: SALE_LOCATION_KIND.NPC_STATION,
  id: "jita",
  name: "Jita IV - Moon 4",
  feeStationID: 60003760,
  brokerFee: null,
};

vi.mock("../../../Hooks/React Query/Character/useSellingRates", () => ({
  useSellingRates,
}));
vi.mock("../../../Functions/MarketOrders/saleLocations", async (actual) => ({
  ...(await actual()),
  resolveSaleLocation: () => STATION,
}));

const { useReprocessingSellingFees } =
  await import("./useReprocessingSellingFees.js");

beforeEach(() => {
  useSellingRates.mockReset();
  useSellingRates.mockReturnValue({ data: undefined, isLoading: false });
});

describe("useReprocessingSellingFees", () => {
  it("quotes a reader with no character at every skill's highest level, asking for no character", () => {
    const { result } = renderHook(() =>
      useReprocessingSellingFees("jita", null),
    );

    expect(result.current.feePercent).toBeCloseTo(4.875, 10);
    expect(result.current.typed).toBe(true);
    expect(useSellingRates).toHaveBeenCalledWith(null, null);
  });

  it("uses what a reader with no character typed", () => {
    const { result } = renderHook(() =>
      useReprocessingSellingFees("jita", null, { brokerFee: 2, salesTax: 4 }),
    );

    expect(result.current).toMatchObject({ feePercent: 6, typed: true });
  });

  it("quotes the seller's own rates at the market the page prices against", () => {
    useSellingRates.mockReturnValue({
      data: { brokerFee: { rate: 1.2 }, salesTax: { rate: 3 } },
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useReprocessingSellingFees("jita", "seller-hash"),
    );

    expect(result.current).toMatchObject({
      brokerFee: 1.2,
      salesTax: 3,
      typed: false,
      isLoading: false,
    });
    expect(result.current.feePercent).toBeCloseTo(4.2, 10);
    expect(useSellingRates).toHaveBeenCalledWith(STATION, "seller-hash");
  });

  it("says it is still loading while the seller's skills and standings are on their way", () => {
    useSellingRates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useReprocessingSellingFees("jita", "seller-hash"),
    );

    expect(result.current).toMatchObject({ typed: false, isLoading: true });
  });

  it("stops loading when the seller's rates could not be read", () => {
    useSellingRates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { result } = renderHook(() =>
      useReprocessingSellingFees("jita", "seller-hash"),
    );

    expect(result.current.isLoading).toBe(false);
  });
});
