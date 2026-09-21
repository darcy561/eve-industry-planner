import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appliedTo,
  commandActions,
  commandsRun,
} from "../../../tests/jobCommandSpy.js";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { testQueryClientCollapsingRetries } from "../../../tests/queryClients.js";

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

/** The runs the job already holds, keyed as the document keys them. */
function linkedRuns(rows = []) {
  return Object.fromEntries(rows.map((row) => [String(row.job_id), row]));
}

function render(industryJobs, allIndustryJobs, actions = commandActions()) {
  const client = testQueryClientCollapsingRetries();
  const rendered = renderHook(
    () =>
      useGatherJobMatchesAndUpdateExistingLinkedJobs(
        allIndustryJobs,
        RIFTER,
        industryJobs,
        new Set(),
        { add: [], remove: [] },
        actions.run,
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
  imperativeFetch.mockReset();
  resolved.current = {};
  pending.current = new Set();
});

// The hook says whether the names are in yet, which is what the page waits on
// before drawing. The panels beneath it resolve their own rows' ids through the
// same shared cache.
describe("the job matches a building panel is given", () => {
  it("holds the page back until the places its rows name are known", async () => {
    pending.current.add(JITA);

    const { result } = render(linkedRuns(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.jobMatches.length).toBe(1));
    expect(result.current.isWorldDataLoading).toBe(true);
  });

  it("lets the page draw once they are", async () => {
    resolved.current[JITA] = {
      id: JITA,
      name: "Jita IV-4",
      resolutionStatus: "resolved",
    };

    const { result } = render(linkedRuns(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.isWorldDataLoading).toBe(false));
    expect(result.current.jobMatches.map(({ job_id }) => job_id)).toEqual([
      500001,
    ]);
  });

  it("asks about the places already-linked jobs sit at too", async () => {
    resolved.current[JITA] = { id: JITA, name: "Jita IV-4" };
    resolved.current[RAITARU] = { id: RAITARU, name: "Abbey Raitaru" };

    const { result } = render(
      linkedRuns([{ job_id: 500002, station_id: RAITARU }]),
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

    const { result } = render(linkedRuns(), [esiJob(500001)]);

    await waitFor(() => expect(result.current.isWorldDataLoading).toBe(false));
    expect(imperativeFetch).not.toHaveBeenCalled();
  });

  // Said as a command rather than written into the job: the job this render is
  // reading is a view of what the session holds, so a change made on it is
  // discarded when the next read rebuilds it.
  it("takes the latest ESI figures onto the job being edited", async () => {
    const linkedAlready = { job_id: 500001, status: "active", runs: 3 };
    const rows = [esiJob(500001, { status: "delivered", runs: 3 })];

    const { actions } = render(linkedRuns([linkedAlready]), rows);

    await waitFor(() => expect(commandsRun(actions)).toHaveLength(1));
    const linked = appliedTo(actions, {
      esi: { industryJobs: { 500001: linkedAlready } },
    }).esi.industryJobs;
    expect(linked["500001"].status).toBe("delivered");
  });

  it("has nothing to match before ESI has answered", () => {
    const { result } = render(linkedRuns(), null);

    expect(result.current.jobMatches).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
