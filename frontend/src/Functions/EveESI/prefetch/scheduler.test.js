import { beforeEach, describe, expect, it, vi } from "vitest";

const { account, rateLimits, queryGateOpen, tranquility } = vi.hoisted(() => ({
  account: { characters: [], actions: {} },
  rateLimits: new Map(),
  queryGateOpen: { value: true },
  tranquility: { value: { online: true } },
}));

vi.mock("../../Shared/queryExecutionEnabled", () => ({
  isQueryExecutionEnabled: () => queryGateOpen.value,
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

vi.mock("../fetchWithCustomHeaders", () => ({
  getESIRateLimitStatus: (group, hash) => rateLimits.get(`${group}:${hash}`),
}));

vi.mock("../../Debugging/queryWaterfallLogger", () => ({
  ENABLE_QUERY_WATERFALL_LOGGING: false,
  logWaterfall: vi.fn(),
  startQueryTracking: () => () => 1,
}));

import { planPrefetch, prefetchCollections } from "./scheduler";
import { COLLECTIONS, PHASE, SCOPE } from "./collections";

function character(hash, corporationId) {
  return {
    CharacterHash: hash,
    CharacterID: Number(hash.replace(/\D/g, "")) || 1,
    corporation_id: corporationId,
  };
}

function setAccount(characters) {
  account.characters = characters;
  account.actions = {
    findCharacterByHash: (hash) =>
      characters.find((c) => c.CharacterHash === hash),
  };
}

function queryClientSpy() {
  const fetched = [];
  return {
    fetched,
    fetchQuery: vi.fn(async (query) => {
      fetched.push(query.queryKey);
    }),
    // The prefetch asks for the Tranquility status before planning; a test decides what it finds.
    ensureQueryData: vi.fn(async () => {
      if (tranquility.value instanceof Error) throw tranquility.value;
      return tranquility.value;
    }),
  };
}

beforeEach(() => {
  rateLimits.clear();
  queryGateOpen.value = true;
  tranquility.value = { online: true };
  setAccount([]);
});

describe("the collection table", () => {
  // Pinned by name: a count taken from the table cannot notice a collection dropped from it.
  it("describes every collection the app holds", () => {
    expect(COLLECTIONS.map((c) => c.key)).toEqual([
      "characterSkills",
      "characterBlueprints",
      "characterIndustryJobs",
      "corporationBlueprints",
      "corporationIndustryJobs",
      "characterStandings",
      "characterMarketOrders",
      "characterHistoricMarketOrders",
      "characterJournal",
      "characterTransactions",
      "corporationMarketOrders",
      "corporationHistoricMarketOrders",
      "corporationJournal",
      "corporationTransactions",
      "characterAssets",
      "corporationAssets",
    ]);
  });

  it("gives every collection a scope, a phase, a group and a query", () => {
    for (const collection of COLLECTIONS) {
      expect(Object.values(SCOPE), collection.key).toContain(collection.scope);
      expect(Object.values(PHASE), collection.key).toContain(collection.phase);
      expect(typeof collection.group, collection.key).toBe("string");
      expect(typeof collection.query, collection.key).toBe("function");
    }
  });

  it("records assets as fetched on demand rather than omitting them", () => {
    const assets = COLLECTIONS.filter((c) => c.key.endsWith("Assets"));

    expect(assets).toHaveLength(2);
    expect(assets.every((c) => c.phase === PHASE.ON_DEMAND)).toBe(true);
  });
});

describe("planPrefetch", () => {
  it("produces one item per character for a character collection", () => {
    setAccount([character("hash-a", 98000001), character("hash-b", 98000001)]);

    const items = planPrefetch(["hash-a", "hash-b"], PHASE.FIRST_PAINT);
    const skills = items.filter((i) => i.name === "Character Skills");

    expect(skills.map((i) => i.budgetHash)).toEqual(["hash-a", "hash-b"]);
  });

  it("produces one item per corporation for a corporation collection", () => {
    setAccount([
      character("hash-a", 98000001),
      character("hash-b", 98000001),
      character("hash-c", 98000002),
    ]);

    const items = planPrefetch(
      ["hash-a", "hash-b", "hash-c"],
      PHASE.FIRST_PAINT,
    );
    const corpBlueprints = items.filter(
      (i) => i.name === "Corporation Blueprints",
    );

    // Three characters across two corporations: two fetches, not three.
    expect(corpBlueprints).toHaveLength(2);
  });

  it("produces one item per corporation per wallet division", () => {
    setAccount([
      character("hash-a", 98000001),
      character("hash-b", 98000001),
      character("hash-c", 98000002),
    ]);

    const items = planPrefetch(["hash-a", "hash-b", "hash-c"], PHASE.DEFERRED);
    const journal = items.filter((i) =>
      i.name.startsWith("Corporation Journal"),
    );

    // Two corporations, seven divisions each. Before the re-key this was seven per character.
    expect(journal).toHaveLength(14);
    expect(new Set(journal.map((i) => i.name)).size).toBe(7);
  });

  it("collapses a corporation's work however many members it has", () => {
    setAccount([
      character("hash-a", 98000001),
      character("hash-b", 98000001),
      character("hash-c", 98000001),
      character("hash-d", 98000001),
      character("hash-e", 98000001),
    ]);
    const hashes = ["hash-a", "hash-b", "hash-c", "hash-d", "hash-e"];

    const items = [
      ...planPrefetch(hashes, PHASE.FIRST_PAINT),
      ...planPrefetch(hashes, PHASE.DEFERRED),
    ];

    // Five characters in one corporation: 8 character collections each, plus one corporation
    // collection per corporation-scoped row and one per wallet division.
    const characterItems = items.filter((i) => i.name.startsWith("Character"));
    const corporationItems = items.filter((i) =>
      i.name.startsWith("Corporation"),
    );

    expect(characterItems).toHaveLength(8 * 5);
    expect(corporationItems).toHaveLength(4 + 7 + 7);
  });

  it("plans nothing for an on-demand collection", () => {
    setAccount([character("hash-a", 98000001)]);

    const everyPhase = Object.values(PHASE).flatMap((phase) =>
      planPrefetch(["hash-a"], phase),
    );

    expect(everyPhase.some((i) => i.name.endsWith("Assets"))).toBe(false);
  });

  it("skips a character the store does not know", () => {
    setAccount([character("hash-a", 98000001)]);

    const items = planPrefetch(["hash-a", "ghost"], PHASE.FIRST_PAINT);

    expect(items.every((i) => i.budgetHash === "hash-a")).toBe(true);
  });

  it("skips a corporation collection for a character with no corporation", () => {
    setAccount([character("hash-a", undefined)]);

    const items = planPrefetch(["hash-a"], PHASE.FIRST_PAINT);

    expect(items.some((i) => i.name === "Corporation Blueprints")).toBe(false);
  });
});

describe("prefetchCollections", () => {
  it("does nothing without characters", async () => {
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, []);

    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
  });

  it("runs first paint before deferred", async () => {
    setAccount([character("hash-a", 98000001)]);
    const order = [];
    const queryClient = {
      ensureQueryData: async () => tranquility.value,
      fetchQuery: vi.fn(async (query) => {
        order.push(query.queryKey[0]);
      }),
    };

    await prefetchCollections(queryClient, ["hash-a"]);

    const firstPaintKeys = COLLECTIONS.filter(
      (c) => c.phase === PHASE.FIRST_PAINT,
    ).length;
    const deferredStart = order.findIndex((key) =>
      key.startsWith("characterStandings"),
    );

    expect(deferredStart).toBeGreaterThanOrEqual(firstPaintKeys - 1);
  });

  // The query definitions gate themselves on being logged in with Tranquility up. The prefetch
  // used to force every query enabled, so a login during an outage fired the whole table at an
  // offline server.
  it("fetches nothing while the query gate is closed", async () => {
    setAccount([character("hash-a", 98000001)]);
    queryGateOpen.value = false;
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-a"]);

    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
  });

  it("reports a failed collection without abandoning the rest", async () => {
    setAccount([character("hash-a", 98000001)]);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let calls = 0;
    const queryClient = {
      ensureQueryData: async () => tranquility.value,
      fetchQuery: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("esi down");
      }),
    };

    await prefetchCollections(queryClient, ["hash-a"]);

    expect(consoleError).toHaveBeenCalled();
    expect(calls).toBeGreaterThan(1);
    consoleError.mockRestore();
  });

  it("stops a phase when every remaining bucket is spent", async () => {
    setAccount([character("hash-a", 98000001)]);
    for (const group of ["character", "industry", "corporation", "assets"]) {
      rateLimits.set(`${group}:hash-a`, {
        availableTokens: 0,
        maxTokens: 100,
        windowSize: 60000,
      });
    }
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-a"]);

    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
  });

  // Login warms the main character from one place and the linked characters from another. Before
  // the queue was shared, each call walked its own phases, so every one of the first call's
  // deferred collections ran before any of the second call's first-paint work.
  it("runs a later caller's first paint before an earlier caller's remaining deferred work", async () => {
    setAccount([character("hash-a", 98000001), character("hash-b", 98000002)]);
    const order = [];
    const queryClient = {
      ensureQueryData: async () => tranquility.value,
      fetchQuery: vi.fn(async (query) => {
        order.push(query.queryKey);
      }),
    };

    const first = prefetchCollections(queryClient, ["hash-a"]);
    const second = prefetchCollections(queryClient, ["hash-b"]);
    await Promise.all([first, second]);

    const firstPaintRoots = COLLECTIONS.filter(
      (c) => c.phase === PHASE.FIRST_PAINT,
    ).map((c) => c.key);

    const lastOfBsFirstPaint = order.findLastIndex(
      ([root, id]) => firstPaintRoots.includes(root) && id === "hash-b",
    );
    const lastDeferred = order.findLastIndex(
      ([root]) => !firstPaintRoots.includes(root),
    );

    expect(lastOfBsFirstPaint).toBeGreaterThan(-1);
    expect(lastOfBsFirstPaint).toBeLessThan(lastDeferred);

    // The invariant, not just the ordering: no deferred collection is picked while first-paint work
    // is still queued. Only what was already in flight when the last first-paint item arrived may
    // precede it, which the budget caps at eight.
    const deferredBeforeFirstPaintFinished = order
      .slice(0, lastOfBsFirstPaint)
      .filter(([root]) => !firstPaintRoots.includes(root)).length;
    expect(deferredBeforeFirstPaintFinished).toBeLessThanOrEqual(8);
  });

  it("does not schedule the same fetch twice for two callers", async () => {
    // Both characters are in one corporation, so its collections are one piece of work.
    setAccount([character("hash-a", 98000001), character("hash-b", 98000001)]);
    const queryClient = queryClientSpy();

    await Promise.all([
      prefetchCollections(queryClient, ["hash-a"]),
      prefetchCollections(queryClient, ["hash-b"]),
    ]);

    const corporationBlueprints = queryClient.fetched.filter(
      ([root]) => root === "corporationBlueprints",
    );
    expect(corporationBlueprints).toHaveLength(1);
  });

  // A caller arriving after a drain has finished starts a new one. The shared queue is cleared on
  // the way out, so nothing of the first run can hold the second's work back.
  it("runs a caller that arrives after an earlier prefetch finished", async () => {
    setAccount([character("hash-a", 98000001)]);
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-a"]);
    const afterFirst = queryClient.fetched.length;
    await prefetchCollections(queryClient, ["hash-a"]);

    expect(afterFirst).toBeGreaterThan(0);
    expect(queryClient.fetched.length).toBe(afterFirst * 2);
  });

  it("holds two callers together to one budget", async () => {
    setAccount([character("hash-a", 98000001), character("hash-b", 98000002)]);
    let inFlight = 0;
    let peak = 0;
    const queryClient = {
      ensureQueryData: async () => tranquility.value,
      fetchQuery: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
      }),
    };

    await Promise.all([
      prefetchCollections(queryClient, ["hash-a"]),
      prefetchCollections(queryClient, ["hash-b"]),
    ]);

    // One queue, one cap — not eight per caller.
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("holds concurrent requests to the budget", async () => {
    setAccount([
      character("hash-a", 98000001),
      character("hash-b", 98000002),
      character("hash-c", 98000003),
    ]);
    let inFlight = 0;
    let peak = 0;
    const queryClient = {
      ensureQueryData: async () => tranquility.value,
      fetchQuery: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight -= 1;
      }),
    };

    await prefetchCollections(queryClient, ["hash-a", "hash-b", "hash-c"]);

    // Three characters carry well over eight requests between them; the cap is on requests, not
    // on characters, so the old three-characters-at-a-time bound would have allowed far more.
    expect(queryClient.fetchQuery.mock.calls.length).toBeGreaterThan(8);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("still fetches the items whose buckets have tokens when others are spent", async () => {
    setAccount([character("hash-a", 98000001)]);
    // Only the industry bucket is spent; character and corporation work must still run.
    rateLimits.set("industry:hash-a", {
      availableTokens: 0,
      maxTokens: 100,
      windowSize: 60000,
    });
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-a"]);

    const fetchedRoots = queryClient.fetched.map(([root]) => root);
    expect(fetchedRoots).toContain("characterSkills");
    expect(fetchedRoots).not.toContain("characterIndustryJobs");
  });

  it("fetches when a bucket still has tokens", async () => {
    setAccount([character("hash-a", 98000001)]);
    rateLimits.set("character:hash-a", {
      availableTokens: 50,
      maxTokens: 100,
      windowSize: 60000,
    });
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-a"]);

    expect(queryClient.fetchQuery).toHaveBeenCalled();
  });
});

describe("waiting for the Tranquility status", () => {
  // The collection queries disable themselves until the status is cached, and it is fetched at app
  // start in parallel with login. Planning first dropped every item and the prefetch reported
  // success having fetched nothing — collections then arrived only when a page mounted a consumer.
  it("plans nothing until the status has been answered", async () => {
    let answer;
    const held = new Promise((resolve) => {
      answer = resolve;
    });
    setAccount([character("hash-1", 98000001)]);
    const queryClient = queryClientSpy();
    queryClient.ensureQueryData = vi.fn(() => held);
    queryGateOpen.value = false;

    const prefetching = prefetchCollections(queryClient, ["hash-1"]);
    expect(queryClient.fetchQuery).not.toHaveBeenCalled();

    queryGateOpen.value = true;
    answer({ online: true });
    await prefetching;

    expect(queryClient.fetchQuery).toHaveBeenCalled();
  });

  it("fetches nothing at an offline server", async () => {
    setAccount([character("hash-1", 98000001)]);
    tranquility.value = { online: false };
    const queryClient = queryClientSpy();

    await prefetchCollections(queryClient, ["hash-1"]);

    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
  });

  it("fetches nothing when the status cannot be had", async () => {
    setAccount([character("hash-1", 98000001)]);
    tranquility.value = new Error("ESI unreachable");
    const queryClient = queryClientSpy();
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});

    await prefetchCollections(queryClient, ["hash-1"]);

    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });
});
