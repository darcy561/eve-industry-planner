import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({
  account: { corporations: [], actions: {} },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

import {
  corporationMembers,
  readAsAuthorisedMember,
} from "./corporationAccess";

beforeEach(() => {
  account.corporations = [
    { corporation_id: 98000001, members: ["hash-a", "hash-b", "hash-c"] },
  ];
  account.actions = {
    findCharacterByHash: (hash) =>
      hash === "ghost" ? undefined : { CharacterHash: hash },
  };
});

describe("corporationMembers", () => {
  it("returns the corporation's members", () => {
    expect(corporationMembers(98000001)).toEqual([
      "hash-a",
      "hash-b",
      "hash-c",
    ]);
  });

  it("matches a corporation id given as a string", () => {
    expect(corporationMembers("98000001")).toHaveLength(3);
  });

  it("returns nothing for a corporation the account does not track", () => {
    expect(corporationMembers(99999999)).toEqual([]);
  });
});

describe("readAsAuthorisedMember", () => {
  it("stops at the first member that is not refused", async () => {
    const tried = [];
    const rows = await readAsAuthorisedMember(
      ["hash-a", "hash-b", "hash-c"],
      async (character, hash) => {
        tried.push(hash);
        return { rows: [{ owner: hash }], forbidden: false };
      },
    );

    expect(tried).toEqual(["hash-a"]);
    expect(rows).toEqual([{ owner: "hash-a" }]);
  });

  it("walks past a refusal to a member that is authorised", async () => {
    const tried = [];
    const rows = await readAsAuthorisedMember(
      ["hash-a", "hash-b", "hash-c"],
      async (character, hash) => {
        tried.push(hash);
        return { rows: [{ owner: hash }], forbidden: hash !== "hash-b" };
      },
    );

    expect(tried).toEqual(["hash-a", "hash-b"]);
    expect(rows).toEqual([{ owner: "hash-b" }]);
  });

  // A refusal and a corporation that genuinely holds nothing are the same rows; only the flag
  // separates them, and treating an empty success as a refusal would fetch N times for nothing.
  it("accepts an authorised member's empty result rather than trying the next", async () => {
    const tried = [];
    const rows = await readAsAuthorisedMember(
      ["hash-a", "hash-b"],
      async (character, hash) => {
        tried.push(hash);
        return { rows: [], forbidden: false };
      },
    );

    expect(tried).toEqual(["hash-a"]);
    expect(rows).toEqual([]);
  });

  it("returns nothing when every member is refused", async () => {
    const rows = await readAsAuthorisedMember(
      ["hash-a", "hash-b"],
      async () => ({ rows: [{ any: true }], forbidden: true }),
    );

    expect(rows).toEqual([]);
  });

  it("skips a member the store cannot resolve", async () => {
    const tried = [];
    const rows = await readAsAuthorisedMember(
      ["ghost", "hash-b"],
      async (character, hash) => {
        tried.push(hash);
        return { rows: [{ owner: hash }], forbidden: false };
      },
    );

    expect(tried).toEqual(["hash-b"]);
    expect(rows).toEqual([{ owner: "hash-b" }]);
  });

  it("returns nothing when there are no members", async () => {
    const attempt = vi.fn();

    expect(await readAsAuthorisedMember([], attempt)).toEqual([]);
    expect(attempt).not.toHaveBeenCalled();
  });
});
