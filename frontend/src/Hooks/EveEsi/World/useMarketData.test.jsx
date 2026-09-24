import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, structureAsks, marketRows, citadelRows } = vi.hoisted(() => ({
  store: { account: { characters: [] } },
  structureAsks: [],
  marketRows: { current: [] },
  citadelRows: { current: [] },
}));

// The citadels inside this region that ESI does not publish, as the rotation
// stored them. Its own tests cover how they are found and read.
vi.mock("../../React Query/World/citadelOrders", () => ({
  useCitadelOrdersQuery: () => ({
    orders: citadelRows.current,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Functions/EveESI/World/getMarketData", () => ({
  default: async () => ({ data: marketRows.current, totalPages: 1 }),
}));

vi.mock("../../App/useESIRateLimiting", () => ({
  default: () => ({ isRateLimited: () => false, getWaitTime: () => 0 }),
}));

vi.mock("../../../Functions/EveESI/World/getUniverseNames", () => ({
  default: async (ids) => ids.map((id) => ({ id, name: `Station ${id}` })),
}));

// The structure answers for one character only — the alt. Asking as the main alone is what used to
// leave it as "No Access To Location".
vi.mock("../../../Functions/EveESI/World/getCitadelData", () => ({
  fetchStructureName: async (id, character) => {
    structureAsks.push(character.CharacterHash);
    if (character.CharacterHash !== "alt") return { refused: true };
    return {
      refused: false,
      // `/universe/structures/` answers with the system it sits in, which is the
      // only way an order read from a structure learns which system it is in.
      name: {
        id,
        name: "Alt's Sotiyo",
        solar_system_id: id === 1035466617947 ? 30000145 : 30000144,
        resolutionStatus: "resolved",
      },
    };
  },
  communityNameOrRefusal: async (id) => ({
    id,
    name: `No Access To Location - ${id}`,
    resolutionStatus: "no_access",
  }),
}));

import { useMarketData } from "./useMarketData";
import { testQueryClientCollapsingRetries } from "../../../tests/queryClients.js";

const THE_FORGE = 10000002;
const JITA = 60003760;
const SOTIYO = 1035466617946;
const OTHER_SOTIYO = 1035466617947;

let sharedClient;

function render(typeID, location) {
  sharedClient = testQueryClientCollapsingRetries();
  return mountOn(sharedClient, typeID, location);
}

/** Mounts again over the names the last mount resolved, as a session does. */
function renderSharingNames(typeID, location) {
  return mountOn(sharedClient, typeID, location);
}

function mountOn(client, typeID, location) {
  return renderHook(() => useMarketData(typeID, location), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

beforeEach(() => {
  store.account = {
    characters: [{ CharacterHash: "main" }, { CharacterHash: "alt" }],
    actions: { getMainCharacter: () => ({ CharacterHash: "main" }) },
  };
  structureAsks.length = 0;
  marketRows.current = [];
  citadelRows.current = [];
});

describe("the market data a panel renders", () => {
  // Stage D's bar: this panel resolved names as the main character alone, so a structure only an alt
  // could dock at came back refused — and that refusal was written where every other surface read it.
  it("names a structure only an alt can see", async () => {
    marketRows.current = [
      { order_id: 1, location_id: SOTIYO, system_id: 30000142, price: 10 },
    ];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[SOTIYO]?.name).toBe("Alt's Sotiyo"),
    );
    expect(structureAsks).toEqual(["main", "alt"]);
  });

  it("names the stations and systems its orders sit in", async () => {
    marketRows.current = [
      { order_id: 1, location_id: JITA, system_id: 30000142, price: 10 },
    ];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[JITA]?.name).toBe(`Station ${JITA}`),
    );
    // The region and the system come from the same bulk lookup as the station.
    expect(result.current.worldData[THE_FORGE]?.name).toBe(
      `Station ${THE_FORGE}`,
    );
  });

  // The dialogue is region-wide on purpose, and a region's orders from ESI carry
  // only the structures whose owners made them public.
  it("shows a citadel only the reader can read beside the region's own orders", async () => {
    marketRows.current = [
      { order_id: 1, location_id: JITA, system_id: 30000142, price: 10 },
    ];
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() => expect(result.current.marketData).toHaveLength(2));
    expect(result.current.marketData.map((o) => o.price)).toEqual([10, 9]);
  });

  // A citadel the reader saved may be one ESI publishes, in which case the
  // region already answered for it and both sides hold the same market.
  it("does not show a market the region already answered for twice", async () => {
    marketRows.current = [
      { order_id: 1, location_id: SOTIYO, system_id: 30000144, price: 10 },
    ];
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[SOTIYO]?.name).toBe("Alt's Sotiyo"),
    );
    expect(result.current.marketData).toHaveLength(1);
  });

  // A structure's orders carry no system of their own, so the column that says
  // which system undercuts which is blank until the structure has been named.
  it("names the system a privately-read order sits in", async () => {
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.marketData[0].system_id).toBe(30000144),
    );
    // And the system id is asked about in turn, because the column shows a name.
    await waitFor(() =>
      expect(result.current.worldData[30000144]?.name).toBe("Station 30000144"),
    );
  });

  // Names are kept for the session, so a structure named on an earlier surface
  // is already in hand on the first render here — and the system it sits in
  // still has to be asked about, or the column reads as unknown with everything
  // needed to fill it already known.
  it("asks about the system of a structure that was named before it opened", async () => {
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const first = render(34, { regionID: THE_FORGE, stationID: JITA });
    await waitFor(() =>
      expect(first.result.current.worldData[30000144]?.name).toBe(
        "Station 30000144",
      ),
    );
    first.unmount();

    const { result } = renderSharingNames(34, {
      regionID: THE_FORGE,
      stationID: JITA,
    });

    await waitFor(() =>
      expect(result.current.worldData[30000144]?.name).toBe("Station 30000144"),
    );
  });

  // One citadel's orders leaving the merge while another's stay names a smaller
  // set than before — which is not the same as the first one moving.
  it("keeps a system when a later round names a different one", async () => {
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const { result, rerender } = render(34, {
      regionID: THE_FORGE,
      stationID: JITA,
    });
    await waitFor(() =>
      expect(result.current.worldData[30000144]?.name).toBe("Station 30000144"),
    );

    citadelRows.current = [
      { order_id: 3, location_id: OTHER_SOTIYO, price: 7 },
    ];
    rerender();

    await waitFor(() =>
      expect(result.current.worldData[30000145]?.name).toBe("Station 30000145"),
    );
    expect(result.current.worldData[30000144]?.name).toBe("Station 30000144");
  });

  // A round that has not answered yet finds no systems, and must not take back
  // one already learned.
  it("keeps a system it found when a later round finds none", async () => {
    citadelRows.current = [{ order_id: 2, location_id: SOTIYO, price: 9 }];

    const { result, rerender } = render(34, {
      regionID: THE_FORGE,
      stationID: JITA,
    });
    await waitFor(() =>
      expect(result.current.marketData[0].system_id).toBe(30000144),
    );

    citadelRows.current = [];
    rerender();

    expect(result.current.worldData[30000144]?.name).toBe("Station 30000144");
  });

  // An empty market still has a region, and the panel says which one it found nothing in.
  it("names the region when no orders came back", async () => {
    const { result } = render(34, { regionID: THE_FORGE, stationID: JITA });

    await waitFor(() =>
      expect(result.current.worldData[THE_FORGE]?.name).toBe(
        `Station ${THE_FORGE}`,
      ),
    );
    // Nothing was asked of a character: an empty market names no structures.
    expect(structureAsks).toHaveLength(0);
  });
});
