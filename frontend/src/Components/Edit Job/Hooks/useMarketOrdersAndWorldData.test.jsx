import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appliedTo,
  commandActions,
  commandsRun,
  unchangedBy,
} from "../../../tests/jobCommandSpy.js";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const {
  store,
  requested,
  resolved,
  pending,
  imperativeFetch,
  matches,
  characterOrders,
} = vi.hoisted(() => ({
  store: {
    account: { characters: [] },
  },
  requested: [],
  resolved: { current: {} },
  pending: { current: new Set() },
  imperativeFetch: vi.fn(),
  matches: { current: [] },
  characterOrders: { current: {} },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

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

const emptyOrders = { data: {}, isLoading: false, isError: false, error: null };
vi.mock(
  "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders",
  () => ({
    useGetAllCharacterMarketOrders: () => ({
      ...emptyOrders,
      data: characterOrders.current,
    }),
  }),
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
import { testQueryClientCollapsingRetries } from "../../../tests/queryClients.js";

const JITA = 60003760;
const RAITARU = 1035466617946;

function activeJob(marketOrders = []) {
  return {
    itemID: 587,
    esi: {
      marketOrders: Object.fromEntries(
        marketOrders.map((row) => [String(row.order_id), row]),
      ),
    },
  };
}

function render(job, actions = commandActions()) {
  const client = testQueryClientCollapsingRetries();
  const rendered = renderHook(
    () =>
      useGatherMarketOrdersAndUpdateExistingLinkedOrders(
        client,
        job,
        new Set(),
        { marketOrders: { add: [], remove: [] } },
        actions,
      ),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...rendered, actions };
}

beforeEach(() => {
  store.account = { characters: [{ CharacterHash: "hash-a" }] };
  requested.length = 0;
  resolved.current = {};
  pending.current = new Set();
  imperativeFetch.mockReset();
  matches.current = [];
  characterOrders.current = {};
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

// The panel is where a linked order is brought up to date as ESI moves. It says
// what changed as a command rather than writing into the job, so what a test
// reads is the command it recorded.
describe("bringing a linked order up to date", () => {
  const linked = (overrides = {}) => ({
    order_id: 700003,
    location_id: JITA,
    type_id: 587,
    volume_remain: 40,
    item_price: 5,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
    state: "active",
    timeStamps: [],
    ...overrides,
  });

  const reported = (overrides = {}) => ({
    order_id: 700003,
    type_id: 587,
    price: 5,
    volume_remain: 40,
    issued: "2026-08-01T00:00:00Z",
    duration: 90,
    range: "region",
    state: "open",
    ...overrides,
  });

  it("records what ESI now says about the order", async () => {
    const job = activeJob([linked()]);
    characterOrders.current = {
      "hash-a": [reported({ volume_remain: 12, price: 6.5 })],
    };

    const { result, actions } = render(job);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const order = appliedTo(actions, job).esi.marketOrders["700003"];
    expect(order.volume_remain).toBe(12);
    expect(order.item_price).toBe(6.5);
  });

  it("records nothing when the order has not moved", async () => {
    const job = activeJob([linked({ state: "open" })]);
    characterOrders.current = { "hash-a": [reported()] };

    const { result, actions } = render(job);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(
      commandsRun(actions).every((command) => unchangedBy(command, job)),
    ).toBe(true);
  });
});
