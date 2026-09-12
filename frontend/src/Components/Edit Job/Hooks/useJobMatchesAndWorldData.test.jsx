import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, requested, resolved, pending, imperativeFetch } = vi.hoisted(
  () => ({
    imperativeFetch: vi.fn(),
    store: {
      account: { characters: [] },
    },
    requested: [],
    resolved: { current: {} },
    pending: { current: new Set() },
  }),
);

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

// The path this hook used to take: ids gathered in an effect, names fetched imperatively, and the
// answer written into the store by hand.
vi.mock("../../../Hooks/React Query/World/names", async (original) => ({
  ...(await original()),
  fetchNames: (...args) => imperativeFetch(...args),
}));

vi.mock("../../../Functions/EveESI/World/nameLoader", () => ({
  requestName: async (id) => {
    requested.push(id);
    // An id left pending stands for one still being asked about.
    if (pending.current.has(id)) await new Promise(() => {});
    return resolved.current[id] ?? { id, resolutionStatus: "unnamed" };
  },
}));

import { useGatherJobMatchesAndUpdateExistingLinkedJobs } from "./useJobMatchesAndWorldData";

const JITA = 60003760;
const RAITARU = 1035466617946;
const RIFTER = 587;

function esiJob(job_id, overrides = {}) {
  return {
    job_id,
    product_type_id: RIFTER,
    activity_id: 1,
    runs: 3,
    status: "active",
    facility_id: JITA,
    station_id: JITA,
    ...overrides,
  };
}

/** Only what this hook reads off the job it is given. */
function activeJob(linkedJobs = []) {
  return {
    itemID: RIFTER,
    jobType: 1,
    build: { costs: { linkedJobs } },
    updateLinkedJobData: vi.fn(),
    esiJobIDs: new Set(),
  };
}

function render(job, allIndustryJobs) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
  return renderHook(
    () =>
      useGatherJobMatchesAndUpdateExistingLinkedJobs(
        allIndustryJobs,
        job,
        new Set(),
        { industryJobs: { add: [], remove: [] } },
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
  imperativeFetch.mockReset();
  resolved.current = {};
  pending.current = new Set();
});

// The hook used to resolve these names itself, while the panels beneath it resolved the same ids
// again through the shared cache. It now only says whether the names are in yet, which is what the
// page waits on before drawing.
describe("the job matches a building panel is given", () => {
  it("holds the page back until the places its rows name are known", async () => {
    pending.current.add(JITA);

    const { result } = render(activeJob(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.jobMatches.length).toBe(1));
    expect(result.current.isWorldDataLoading).toBe(true);
  });

  it("lets the page draw once they are", async () => {
    resolved.current[JITA] = {
      id: JITA,
      name: "Jita IV-4",
      resolutionStatus: "resolved",
    };

    const { result } = render(activeJob(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.isWorldDataLoading).toBe(false));
    expect(result.current.jobMatches.map(({ job_id }) => job_id)).toEqual([
      500001,
    ]);
  });

  it("asks about the places already-linked jobs sit at too", async () => {
    resolved.current[JITA] = { id: JITA, name: "Jita IV-4" };
    resolved.current[RAITARU] = { id: RAITARU, name: "Abbey Raitaru" };

    const { result } = render(
      activeJob([{ job_id: 500002, station_id: RAITARU }]),
      [esiJob(500001)],
    );

    await waitFor(() => expect(result.current.isWorldDataLoading).toBe(false));
    expect(requested).toContain(RAITARU);
  });

  // One resolution path, not two: the panels beneath this hook resolve the same ids through the
  // shared cache, so fetching them again here was work done twice and a second writer into the
  // store.
  it("resolves nothing of its own", async () => {
    resolved.current[JITA] = { id: JITA, name: "Jita IV-4" };

    const { result } = render(activeJob(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.isWorldDataLoading).toBe(false));
    expect(imperativeFetch).not.toHaveBeenCalled();
  });

  it("takes the latest ESI figures onto the job being edited", async () => {
    const job = activeJob();
    const rows = [esiJob(500001)];

    render(job, rows);

    await waitFor(() =>
      expect(job.updateLinkedJobData).toHaveBeenCalledWith(rows),
    );
  });

  it("has nothing to match before ESI has answered", () => {
    const { result } = render(activeJob(), null);

    expect(result.current.jobMatches).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
