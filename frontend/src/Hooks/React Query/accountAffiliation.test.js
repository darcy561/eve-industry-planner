import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRefreshAccountSessionGrants } = vi.hoisted(() => ({
  mockRefreshAccountSessionGrants: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../Functions/Auth/refreshAccountSessionGrants", () => ({
  default: mockRefreshAccountSessionGrants,
}));

import useUsersStore from "../../Zustand/usersStore";
import { accountAffiliationQueryOptions } from "./accountAffiliation.js";

/** A character whose public-data fetch reports the corporation the test hands it. */
function character(hash, corporationID, nextCorporationID = corporationID) {
  return {
    CharacterHash: hash,
    isPlaceholder: false,
    corporation_id: corporationID,
    getPublicCharacterData: vi.fn(async function () {
      this.corporation_id = nextCorporationID;
    }),
  };
}

function seed(characters) {
  useUsersStore.setState((s) => ({
    account: { ...s.account, characters, actions: s.account.actions },
  }));
}

describe("account affiliation refresh", () => {
  beforeEach(() => {
    mockRefreshAccountSessionGrants.mockClear();
  });

  it("re-reads every live character and resubmits grants", async () => {
    const a = character("a", 1);
    const b = character("b", 2);
    seed([a, b, { isPlaceholder: true, CharacterHash: "placeholder" }]);

    const result = await accountAffiliationQueryOptions().queryFn();

    expect(a.getPublicCharacterData).toHaveBeenCalledTimes(1);
    expect(b.getPublicCharacterData).toHaveBeenCalledTimes(1);
    expect(mockRefreshAccountSessionGrants).toHaveBeenCalledTimes(1);
    expect(result.corporationsChanged).toBe(0);
  });

  // The roster is subscribed to widely, so a periodic pass that wrote it every time would
  // re-render every consumer for nothing. It writes only when a corporation actually moved.
  it("does not touch the store when nothing changed", async () => {
    seed([character("a", 1)]);
    const subscriber = vi.fn();
    const unsubscribe = useUsersStore.subscribe(subscriber);

    await accountAffiliationQueryOptions().queryFn();

    unsubscribe();
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("writes the roster when a character changed corporation", async () => {
    seed([character("a", 1, 99)]);
    const subscriber = vi.fn();
    const unsubscribe = useUsersStore.subscribe(subscriber);

    const result = await accountAffiliationQueryOptions().queryFn();

    unsubscribe();
    expect(result.corporationsChanged).toBe(1);
    expect(subscriber).toHaveBeenCalled();
    expect(useUsersStore.getState().account.characters[0].corporation_id).toBe(
      99,
    );
  });

  it("still submits grants when one character's public data fails", async () => {
    const failing = character("a", 1);
    failing.getPublicCharacterData = vi
      .fn()
      .mockRejectedValue(new Error("esi down"));
    seed([failing, character("b", 2)]);

    await accountAffiliationQueryOptions().queryFn();

    expect(mockRefreshAccountSessionGrants).toHaveBeenCalledTimes(1);
  });
});
