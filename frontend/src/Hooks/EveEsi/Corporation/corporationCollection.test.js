import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({ account: { corporations: [] } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

import {
  keyRowsByCorporation,
  readCorporationCollection,
} from "./corporationCollection";

function cacheOf(entries) {
  const byKey = new Map(entries.map(([key, value]) => [key.join("|"), value]));
  return {
    getQueryState: (key) =>
      byKey.has(key.join("|")) ? { status: "success" } : undefined,
    getQueryData: (key) => byKey.get(key.join("|")),
  };
}

beforeEach(() => {
  account.corporations = [
    { corporation_id: 98000001 },
    { corporation_id: 98000002 },
  ];
});

describe("keyRowsByCorporation", () => {
  it("keys each payload's rows by its corporation", () => {
    const keyed = keyRowsByCorporation([
      { corporation_id: 98000001, data: [{ id: 1 }] },
      { corporation_id: 98000002, data: [{ id: 2 }] },
    ]);

    expect(keyed).toEqual({ 98000001: [{ id: 1 }], 98000002: [{ id: 2 }] });
  });

  it("concatenates a corporation's wallet divisions", () => {
    const keyed = keyRowsByCorporation([
      { corporation_id: 98000001, division: 1, data: [{ id: 1 }] },
      { corporation_id: 98000001, division: 2, data: [{ id: 2 }] },
      { corporation_id: 98000001, division: 3, data: [] },
    ]);

    expect(keyed[98000001]).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("ignores a payload that names no corporation", () => {
    expect(
      keyRowsByCorporation([undefined, {}, { data: [{ id: 1 }] }]),
    ).toEqual({});
  });
});

describe("readCorporationCollection", () => {
  it("reads one entry per corporation", () => {
    const queryClient = cacheOf([
      [
        ["corpThing", 98000001],
        { corporation_id: 98000001, data: [{ id: 1 }] },
      ],
      [
        ["corpThing", 98000002],
        { corporation_id: 98000002, data: [{ id: 2 }] },
      ],
    ]);

    const { data, isLoading, isError } = readCorporationCollection(
      queryClient,
      "corpThing",
    );

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
    expect(Object.keys(data)).toEqual(["98000001", "98000002"]);
  });

  it("reads every wallet division when divisions are given", () => {
    const divisions = [1, 2, 3];
    const queryClient = cacheOf(
      divisions.map((division) => [
        ["corpWallet", 98000001, division],
        { corporation_id: 98000001, division, data: [{ division }] },
      ]),
    );
    account.corporations = [{ corporation_id: 98000001 }];

    const { data } = readCorporationCollection(
      queryClient,
      "corpWallet",
      divisions,
    );

    expect(data[98000001]).toEqual([
      { division: 1 },
      { division: 2 },
      { division: 3 },
    ]);
  });

  it("reports an error over partial data", () => {
    const queryClient = {
      getQueryState: () => ({ status: "error", error: new Error("nope") }),
      getQueryData: () => undefined,
    };

    const { isError, error, data } = readCorporationCollection(
      queryClient,
      "corpThing",
    );

    expect(isError).toBe(true);
    expect(error.message).toBe("nope");
    expect(data).toEqual({});
  });
});
