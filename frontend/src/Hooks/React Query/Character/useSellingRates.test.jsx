import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getCharacterStandings = vi.fn();
const getCharacterSkills = vi.fn();

// Both reads are faked at the ESI boundary rather than at the hooks above them,
// so the test runs the real subscription — which is the thing that was wrong.
vi.mock("../../../Functions/EveESI/Character/getStandings", () => ({
  default: (...args) => getCharacterStandings(...args),
}));
vi.mock("../../../Functions/EveESI/Character/getSkills", () => ({
  default: (...args) => getCharacterSkills(...args),
}));

vi.mock("../../../Functions/Shared/queryExecutionEnabled", () => ({
  isQueryExecutionEnabled: () => true,
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: {
      actions: { findCharacterByHash: () => ({ CharacterHash: "hash" }) },
    },
  });
});

// As ESI reports Jita 4-4: race_id is the race that built the station, and the
// standing is held against that race's faction.
vi.mock("../../../Functions/EveESI/World/getUniverseNames", () => ({
  default: async () => [
    { id: 500001, name: "Caldari State", category: "faction" },
  ],
}));
vi.mock("../../../Functions/EveESI/World/getRaces", () => ({
  default: async () => [{ race_id: 1, alliance_id: 500001, name: "Caldari" }],
}));
vi.mock("../../../Functions/EveESI/World/getStationData", () => ({
  default: async () => ({ race_id: 1, owner: 1000035 }),
}));

const { useSellingRates } = await import("./useSellingRates");
const { SALE_LOCATION_KIND } =
  await import("../../../Functions/MarketOrders/saleLocations");

const hub = {
  kind: SALE_LOCATION_KIND.HUB,
  id: "jita",
  name: "Jita",
  feeStationID: 60003760,
  brokerFee: null,
};

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCharacterSkills.mockResolvedValue({
    data: { 3446: { activeLevel: 5 }, 16622: { activeLevel: 5 } },
  });
  getCharacterStandings.mockResolvedValue({
    data: [
      { from_id: 500001, from_type: "faction", standing: 5 },
      { from_id: 1000035, from_type: "npc_corp", standing: 5 },
    ],
  });
});

describe("useSellingRates", () => {
  // Nothing outside the Selling stage mounts the standings query, and the
  // cached accessor `sellingRates` reads never starts one — so a hook that only
  // read the cache would quote every station fee with no standings at all.
  it("fetches standings rather than reading an empty cache", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(() => useSellingRates(hub, "hash"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(getCharacterStandings).toHaveBeenCalled();
    const terms = result.current.data.brokerFee.terms;
    expect(terms.find((i) => i.id === "faction").amount).toBeGreaterThan(0);
    expect(terms.find((i) => i.id === "corporation").amount).toBeGreaterThan(0);
  });

  it("quotes the base rates for a signed-out seller without asking ESI", async () => {
    const { wrapper } = harness();

    const { result } = renderHook(() => useSellingRates(hub, null), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(getCharacterStandings).not.toHaveBeenCalled();
    expect(result.current.data.brokerFee.rate).toBe(3);
    expect(result.current.data.salesTax.rate).toBe(7.5);
  });

  it("asks for nothing until it has a location to price", () => {
    const { wrapper } = harness();

    const { result } = renderHook(() => useSellingRates(null, "hash"), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});
