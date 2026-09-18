import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [],
        corporations: [{ corporation_id: 98000001, members: ["hash-1"] }],
        actions: { findCharacterByHash: () => null },
      },
    }),
  );
});

const { COLLECTIONS } = await import("./collections.js");
const {
  COLLECTION_STATE,
  collectionStatus,
  characterCollectionStatuses,
  corporationCollectionStatuses,
} = await import("./collectionStatus.js");

const HASH = "hash-1";
const CORPORATION = 98000001;

function collection(key) {
  return COLLECTIONS.find((entry) => entry.key === key);
}

/** A stand-in for the query client, holding whatever state a test wants to describe. */
function cacheHolding(entries = {}) {
  return {
    getQueryState: (queryKey) => entries[JSON.stringify(queryKey)],
  };
}

function contextFor(overrides = {}) {
  return { characterHash: HASH, corporationId: CORPORATION, ...overrides };
}

describe("what the application holds of a collection", () => {
  let now;

  beforeEach(() => {
    now = 10_000_000;
  });

  it("is fresh while it is inside the collection's own refresh expectation", () => {
    const cache = cacheHolding({
      [JSON.stringify(["characterSkills", HASH])]: {
        status: "success",
        data: [],
        dataUpdatedAt: now - 60_000,
      },
    });

    expect(
      collectionStatus(cache, collection("characterSkills"), contextFor(), now),
    ).toEqual({ state: COLLECTION_STATE.FRESH, at: now - 60_000 });
  });

  it("is stale once it is older than that", () => {
    const cache = cacheHolding({
      [JSON.stringify(["characterSkills", HASH])]: {
        status: "success",
        data: [],
        dataUpdatedAt: now - 4 * 60 * 60 * 1000,
      },
    });

    expect(
      collectionStatus(cache, collection("characterSkills"), contextFor(), now)
        .state,
    ).toBe(COLLECTION_STATE.STALE);
  });

  // Assets are left out of the prefetch deliberately, so their absence is correct rather than a
  // fault, and the page has to say which of the two it is looking at.
  it("separates a collection that is never prefetched from one that is missing", () => {
    const cache = cacheHolding();

    expect(
      collectionStatus(cache, collection("characterAssets"), contextFor(), now)
        .state,
    ).toBe(COLLECTION_STATE.ON_DEMAND);
    expect(
      collectionStatus(cache, collection("characterSkills"), contextFor(), now)
        .state,
    ).toBe(COLLECTION_STATE.MISSING);
  });

  it("is unavailable when the character's token was never granted the scope", () => {
    const cache = cacheHolding();
    const token = tokenCarrying(["esi-skills.read_skills.v1"]);

    expect(
      collectionStatus(
        cache,
        collection("characterBlueprints"),
        contextFor({ accessToken: token }),
        now,
      ).state,
    ).toBe(COLLECTION_STATE.UNAVAILABLE);
    expect(
      collectionStatus(
        cache,
        collection("characterSkills"),
        contextFor({ accessToken: token }),
        now,
      ).state,
    ).toBe(COLLECTION_STATE.MISSING);
  });

  // The queries throw a plain error for a spent rate-limit bucket as readily as for a refusal, so
  // a failed fetch must not be reported as an access the character does not have.
  it("separates a failed fetch from an access the character lacks", () => {
    const cache = cacheHolding({
      [JSON.stringify(["corporationBlueprints", CORPORATION])]: {
        status: "error",
      },
    });

    expect(
      collectionStatus(
        cache,
        collection("corporationBlueprints"),
        contextFor(),
        now,
      ).state,
    ).toBe(COLLECTION_STATE.FAILED);
  });

  // A wallet is granted a division at a time, so one division nobody can read makes the collection
  // incomplete however fresh the other six are.
  it("reports a wallet collection as its worst division", () => {
    const held = {};
    for (const division of [1, 2, 3, 4, 5, 6, 7]) {
      held[JSON.stringify(["corporationJournal", CORPORATION, division])] = {
        status: "success",
        data: [],
        dataUpdatedAt: now - 60_000,
      };
    }
    held[JSON.stringify(["corporationJournal", CORPORATION, 4])] = {
      status: "error",
    };

    expect(
      collectionStatus(
        cacheHolding(held),
        collection("corporationJournal"),
        contextFor(),
        now,
      ).state,
    ).toBe(COLLECTION_STATE.FAILED);
  });

  it("has nothing to say about a corporation collection for a character in no corporation", () => {
    expect(
      collectionStatus(
        cacheHolding(),
        collection("corporationBlueprints"),
        contextFor({ corporationId: undefined }),
        now,
      ).state,
    ).toBe(COLLECTION_STATE.UNAVAILABLE);
  });

  // A corporation's list comes back whole to any member holding the role, so it is answered once
  // for the corporation rather than once per member.
  it("splits the table into what belongs to a character and what to a corporation", () => {
    const character = characterCollectionStatuses(
      cacheHolding(),
      contextFor(),
      now,
    ).map((status) => status.key);
    const corporation = corporationCollectionStatuses(
      cacheHolding(),
      contextFor(),
      now,
    ).map((status) => status.key);

    expect([...character, ...corporation].sort()).toEqual(
      COLLECTIONS.map((entry) => entry.key).sort(),
    );
    expect(character).toContain("corporationAssets");
    expect(corporation).toContain("corporationBlueprints");
    expect(corporation).toContain("corporationJournal");
  });
});

/** An access token is a JWT, and only its claims are read. */
function tokenCarrying(scopes) {
  const claims = btoa(JSON.stringify({ scp: scopes }));
  return `header.${claims}.signature`;
}
