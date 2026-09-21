import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const { usersStoreOverSession } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

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
import useUsersStore from "../../../Zustand/usersStore";
import { usersStoreState } from "../../../tests/usersStoreHarness.js";
import { draftFor } from "../Edit Job Hooks/jobDraftStore.js";

const session = () => useUsersStore.getState().editSession;
const jobNow = () => draftFor(session().draft, "job-1");

const JITA = 60003760;
const RAITARU = 1035466617946;

/** The job the hook reads, opened in the session it reads it from. */
function activeJob(marketOrders = []) {
  const job = {
    jobID: "job-1",
    itemID: 587,
    build: {},
    esi: {
      marketOrders: Object.fromEntries(
        marketOrders.map((row) => [String(row.order_id), row]),
      ),
    },
  };
  session().actions.openJob("job-1", job);
  return job;
}

function render() {
  const client = testQueryClientCollapsingRetries();
  return renderHook(
    () => useGatherMarketOrdersAndUpdateExistingLinkedOrders(client, new Set()),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
}

beforeEach(() => {
  store.account = { characters: [{ CharacterHash: "hash-a" }] };
  session().actions.closeSession();
  useUsersStore.setState(usersStoreState(store));
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
    activeJob([linked()]);
    characterOrders.current = {
      "hash-a": [reported({ volume_remain: 12, price: 6.5 })],
    };

    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const order = jobNow().esi.marketOrders["700003"];
    expect(order.volume_remain).toBe(12);
    expect(order.item_price).toBe(6.5);
  });

  it("records nothing when the order has not moved", async () => {
    activeJob([linked({ state: "open" })]);
    characterOrders.current = { "hash-a": [reported()] };

    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(session().draft.log).toEqual([]);
  });
});
