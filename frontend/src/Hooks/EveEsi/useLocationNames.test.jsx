import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, requestCalls, answers, gate } = vi.hoisted(() => ({
  store: { account: { characters: [] } },
  requestCalls: [],
  answers: { current: new Map() },
  gate: { current: null },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../Functions/EveESI/World/nameLoader", () => ({
  requestName: async (id) => {
    requestCalls.push(id);
    if (gate.current) await gate.current;
    const answer = answers.current.get(id);
    if (!answer) throw new Error(`nothing answered for ${id}`);
    return answer;
  },
}));

import useLocationNames from "./useLocationNames";
import { LOCATION_OUTCOME } from "../../Functions/EveESI/World/locationOutcome";
import { testQueryClientCollapsingRetries } from "../../tests/queryClients.js";

const JITA = 60003760;
const RAITARU = 1035466617946;

const named = (id, name) => ({
  id,
  name,
  resolutionStatus: LOCATION_OUTCOME.NAMED,
});

// One client across a render pair, as the app has: moving between pages does not make a new one.
// It is also the only place a resolved name lives, so a test seeds one by putting it here.
function harness() {
  // The query asks for retries itself, and a per-query option outlives a client default — so the
  // wait between attempts is collapsed rather than the attempts removed.
  const client = testQueryClientCollapsingRetries();
  const render = (ids) =>
    renderHook(() => useLocationNames(ids), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    });
  render.client = client;
  return render;
}

beforeEach(() => {
  store.account = { characters: [{ CharacterHash: "hash-a" }] };
  requestCalls.length = 0;
  answers.current = new Map();
  gate.current = null;
});

describe("useLocationNames", () => {
  it("asks for nothing when given nothing", async () => {
    const { result } = harness()([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requestCalls).toHaveLength(0);
    expect(result.current.names).toEqual({});
  });

  it("asks only for what the cache does not already hold", async () => {
    answers.current.set(RAITARU, named(RAITARU, "Home Raitaru"));
    const render = harness();
    render.client.setQueryData(["esi", "name", JITA], named(JITA, "Jita IV-4"));

    const { result } = render([JITA, RAITARU]);

    await waitFor(() => expect(requestCalls).toEqual([RAITARU]));
    expect(result.current.names[JITA].name).toBe("Jita IV-4");
  });

  it("waits for the account's characters before asking", async () => {
    store.account = { characters: [] };

    const { result } = harness()([RAITARU]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requestCalls).toHaveLength(0);
  });

  it("reports a failure rather than an empty result", async () => {
    const { result } = harness()([RAITARU]);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.names).toEqual({});
  });

  // The defect the project exists for: a lookup that did not settle was remembered as the answer for
  // that page's whole set of ids, and never asked about again.
  it("asks again on the next mount when a lookup failed", async () => {
    const render = harness();
    const { result: firstResult, unmount } = render([JITA, RAITARU]);
    await waitFor(() => expect(firstResult.current.isError).toBe(true));
    unmount();

    answers.current.set(JITA, named(JITA, "Jita IV-4"));
    answers.current.set(RAITARU, named(RAITARU, "Home Raitaru"));

    const { result } = render([JITA, RAITARU]);

    await waitFor(() =>
      expect(result.current.names[RAITARU]?.name).toBe("Home Raitaru"),
    );
  });

  // A failure is never cached, so a failed id has no entry in `names` and nothing there tells it
  // apart from one still being asked about. A surface that shows what it could not resolve needs to.
  it("says which ids did not settle", async () => {
    answers.current.set(JITA, named(JITA, "Jita IV-4"));

    const { result } = harness()([JITA, RAITARU]);

    await waitFor(() => expect(result.current.failed.has(RAITARU)).toBe(true));
    expect(result.current.failed.has(JITA)).toBe(false);
  });

  it("names nothing as failed when every id settled", async () => {
    answers.current.set(JITA, named(JITA, "Jita IV-4"));

    const { result } = harness()([JITA]);

    await waitFor(() => expect(result.current.names[JITA]).toBeTruthy());
    expect(result.current.failed.size).toBe(0);
  });

  // The other half of the same defect: one id failing must not cost the ids beside it.
  it("keeps the names that resolved when one of them fails", async () => {
    answers.current.set(JITA, named(JITA, "Jita IV-4"));

    const { result } = harness()([JITA, RAITARU]);

    await waitFor(() =>
      expect(result.current.names[JITA]?.name).toBe("Jita IV-4"),
    );
    expect(result.current.isError).toBe(true);
  });

  it("asks once when two consumers want the same location", async () => {
    answers.current.set(RAITARU, named(RAITARU, "Home Raitaru"));
    const render = harness();

    const { result: firstResult } = render([RAITARU]);
    const { result: secondResult } = render([RAITARU]);

    await waitFor(() =>
      expect(secondResult.current.names[RAITARU]?.name).toBe("Home Raitaru"),
    );
    expect(requestCalls).toEqual([RAITARU]);
    // One entry, shared: the same object reaches both consumers.
    expect(firstResult.current.names[RAITARU]).toBe(
      secondResult.current.names[RAITARU],
    );
  });

  // A place ESI has no name for is an answer, not a gap. Withholding it left a surface unable to
  // tell it from an id still being asked about, so it showed nothing where a place had been asked
  // for.
  it("hands on an id ESI answered about and did not name", async () => {
    answers.current.set(JITA, {
      id: JITA,
      resolutionStatus: LOCATION_OUTCOME.UNNAMED,
    });

    const { result } = harness()([JITA]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.names[JITA]).toMatchObject({
      resolutionStatus: LOCATION_OUTCOME.UNNAMED,
    });
    expect(result.current.names[JITA].name).toBeUndefined();
    expect(result.current.isError).toBe(false);
  });
});
