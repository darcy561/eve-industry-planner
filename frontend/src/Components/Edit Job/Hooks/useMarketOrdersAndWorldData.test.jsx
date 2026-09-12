import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, requested, resolved, pending, imperativeFetch, matches } =
  vi.hoisted(() => ({
    store: {
      account: { characters: [] },
    },
    requested: [],
    resolved: { current: {} },
    pending: { current: new Set() },
    imperativeFetch: vi.fn(),
    matches: { current: [] },
  }));

vi.mock("../../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

// The path this hook used to take.
vi.mock("../../../Hooks/React Query/World/names", async (original) => ({
  ...(await original()),
  fetchNames: (...args) => imperativeFetch(...args),
}));

vi.mock("../../../Functions/EveESI/World/nameLoader", () => ({
  requestName: async (id) => {
    requested.push(id);
    if (pending.current.has(id)) await new Promise(() => {});
    return resolved.current[id] ?? { id, resolutionStatus: "unnamed" };
  },
}));

vi.mock("../../../Functions/MarketOrders/findMarketOrdersForItem", () => ({
  default: () => matches.current,
}));

vi.mock("../../../Functions/MarketOrders/applyLatestOrderData", () => ({
  default: () => false,
}));

const emptyOrders = { data: {}, isLoading: false, isError: false, error: null };
vi.mock(
  "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders",
  () => ({ useGetAllCharacterMarketOrders: () => emptyOrders }),
);
vi.mock(
  "../../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders",
  () => ({ useGetAllCharacterHistoricMarketOrders: () => emptyOrders }),
);
vi.mock(
  "../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders",
  () => ({ useGetAllCorporationMarketOrders: () => emptyOrders }),
);
vi.mock(
  "../../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders",
  () => ({ useGetAllCorporationHistoricMarketOrders: () => emptyOrders }),
);

import { useGatherMarketOrdersAndUpdateExistingLinkedOrders } from "./useMarketOrdersAndWorldData";

const JITA = 60003760;
const RAITARU = 1035466617946;

function activeJob(marketOrders = []) {
  return { itemID: 587, build: { sale: { marketOrders } } };
}

function render(job) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
  return renderHook(
    () =>
      useGatherMarketOrdersAndUpdateExistingLinkedOrders(
        client,
        job,
        new Set(),
        { marketOrders: { add: [], remove: [] } },
        { updateActiveJob: vi.fn() },
      ),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
}

beforeEach(() => {
  store.account = { characters: [{ CharacterHash: "hash-a" }] };
  requested.length = 0;
  resolved.current = {};
  pending.current = new Set();
  imperativeFetch.mockReset();
  matches.current = [];
});

// The panel gates its whole render on this hook's `isLoading`. It was reading a field the hook has
// never returned, so the gate was `undefined` and the panel drew before any name had arrived.
describe("the market orders a selling panel is given", () => {
  it("holds the page back until the places its orders sit at are known", async () => {
    matches.current = [{ order_id: 700001, location_id: JITA }];
    pending.current.add(JITA);

    const { result } = render(activeJob());

    await waitFor(() =>
      expect(result.current.marketOrderMatches.length).toBe(1),
    );
    expect(result.current.isLoading).toBe(true);
  });

  it("lets the page draw once they are", async () => {
    matches.current = [{ order_id: 700001, location_id: JITA }];
    resolved.current[JITA] = { id: JITA, name: "Jita IV-4" };

    const { result } = render(activeJob());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.marketOrderMatches).toHaveLength(1);
  });

  it("asks about the places already-linked orders sit at too", async () => {
    resolved.current[RAITARU] = { id: RAITARU, name: "Abbey Raitaru" };

    const { result } = render(
      activeJob([{ order_id: 700002, location_id: RAITARU }]),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requested).toContain(RAITARU);
  });

  it("resolves nothing of its own", async () => {
    matches.current = [{ order_id: 700001, location_id: JITA }];
    resolved.current[JITA] = { id: JITA, name: "Jita IV-4" };

    const { result } = render(activeJob());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(imperativeFetch).not.toHaveBeenCalled();
  });
});
