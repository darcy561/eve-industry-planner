import { describe, expect, it } from "vitest";
import Corporation from "../../Classes/corporation.js";
import Alliance from "../../Classes/alliance.js";
import { corporationsActions } from "./corporationsActions.js";
import { alliancesActions } from "./alliancesActions.js";

/**
 * The actions as the store calls them, over a local state object. `getCorporation`
 * is reached through `state.account.actions` by `getMainCorporation`, and dropping a corporation
 * reaches the alliance actions the same way, so both are wired back onto the state exactly as the
 * store wires them.
 *
 * @param {object[]} corporations
 * @param {object[]} [characters]
 */
function actionsOver(corporations, characters = [], alliances = []) {
  const state = {
    account: { corporations, characters, alliances, actions: {} },
  };
  const get = () => state;
  const set = (updater) => {
    Object.assign(state, updater(state));
  };
  state.account.actions = {
    ...corporationsActions(set, get),
    ...alliancesActions(set, get),
    getMainCharacter: () => characters.find((c) => c.isMainCharacter) ?? null,
  };
  return { actions: state.account.actions, state };
}

/** A real Alliance, so the cascade under test drops a real object rather than a stub. */
function allianceOf(allianceID, corporationID) {
  return new Alliance(
    { corporation_id: corporationID, alliance_id: allianceID },
    { name: `Alliance ${allianceID}` },
  );
}

/** A real Corporation, so the member and office merging under test is the real thing. */
function corporation(id, characterHash, publicData = {}) {
  return new Corporation(
    { corporation_id: id, CharacterHash: characterHash },
    { name: `Corp ${id}`, ...publicData },
    {},
  );
}

describe("finding a corporation", () => {
  it("finds one by id and answers null for a miss", () => {
    const corp = corporation(1000, "hash-a");
    const { actions } = actionsOver([corp]);

    expect(actions.getCorporation(1000)).toBe(corp);
    expect(actions.getCorporation(2000)).toBeNull();
  });

  // Ids reach this from ESI payloads and from the URL, so one side is often a
  // string; matching numerically is what stops a lookup silently missing.
  it("matches a string id against a numeric one", () => {
    const corp = corporation(1000, "hash-a");
    const { actions } = actionsOver([corp]);

    expect(actions.getCorporation("1000")).toBe(corp);
  });

  it("reads the main character's corporation", () => {
    const corp = corporation(1000, "hash-a");
    const { actions } = actionsOver(
      [corp],
      [{ isMainCharacter: true, corporation_id: 1000 }],
    );

    expect(actions.getMainCorporation()).toBe(corp);
  });

  it("answers null when there is no main character", () => {
    const { actions } = actionsOver([corporation(1000, "hash-a")], []);

    expect(actions.getMainCorporation()).toBeNull();
  });
});

describe("adding a corporation", () => {
  it("appends one the list does not hold", () => {
    const { actions, state } = actionsOver([corporation(1000, "hash-a")]);

    actions.addCorporation(corporation(2000, "hash-b"));

    expect(state.account.corporations.map((c) => c.corporation_id)).toEqual([
      1000, 2000,
    ]);
  });

  // Replaced in place rather than appended: two rows for one corporation would
  // split its members and its offices between them.
  it("replaces one already held, keeping its position", () => {
    const { actions, state } = actionsOver([
      corporation(1000, "hash-a"),
      corporation(2000, "hash-b"),
    ]);

    actions.addCorporation(corporation(1000, "hash-a", { name: "Renamed" }));

    expect(state.account.corporations).toHaveLength(2);
    expect(state.account.corporations[0].corporationName).toBe("Renamed");
    expect(state.account.corporations[1].corporation_id).toBe(2000);
  });

  it("collapses duplicate members on the way in", () => {
    const corp = corporation(1000, "hash-a");
    corp.members = ["hash-a", "hash-a", "HASH-A"];
    const { actions, state } = actionsOver([]);

    actions.addCorporation(corp);

    expect(state.account.corporations[0].members).toEqual(["hash-a"]);
  });
});

describe("removing a character from its corporations", () => {
  it("drops the member and keeps a corporation that still has others", () => {
    const corp = corporation(1000, "hash-a");
    corp.addMember("hash-b");
    const { actions, state } = actionsOver([corp]);

    actions.removeCharacterFromCorporations("hash-a");

    expect(state.account.corporations).toHaveLength(1);
    expect(state.account.corporations[0].members).toEqual(["hash-b"]);
  });

  // A corporation is only in the list because a linked character is in it, so
  // one with no members left is a corporation this account can no longer see.
  it("drops a corporation whose last member left", () => {
    const { actions, state } = actionsOver([corporation(1000, "hash-a")]);

    actions.removeCharacterFromCorporations("hash-a");

    expect(state.account.corporations).toEqual([]);
  });

  it("drops the character from every corporation holding it", () => {
    const first = corporation(1000, "hash-a");
    const second = corporation(2000, "hash-a");
    second.addMember("hash-b");
    const { actions, state } = actionsOver([first, second]);

    actions.removeCharacterFromCorporations("hash-a");

    expect(state.account.corporations.map((c) => c.corporation_id)).toEqual([
      2000,
    ]);
    expect(state.account.corporations[0].members).toEqual(["hash-b"]);
  });
});

describe("setting corporation offices", () => {
  it("merges new office locations with the ones already held", () => {
    const corp = corporation(1000, "hash-a");
    corp.addOfficeLocations([60000001]);
    const { actions, state } = actionsOver([corp]);

    actions.setCorporationOffices(1000, [60000002]);

    expect(state.account.corporations[0].officeLocations).toEqual(
      expect.arrayContaining([60000001, 60000002]),
    );
  });

  it("does nothing for a corporation that is not held", () => {
    const { actions, state } = actionsOver([corporation(1000, "hash-a")]);

    actions.setCorporationOffices(9999, [60000002]);

    expect(state.account.corporations[0].officeLocations).toEqual([]);
  });
});

describe("a corporation leaving takes its place in an alliance with it", () => {
  // Both sides of this are proven on their own — the corporation drop, and the alliance removal.
  // What is not proven by either is the join: that dropping the last member of a corporation
  // reaches the alliance at all.
  it("keeps the alliance while another of its corporations remains", () => {
    const first = corporation(1000, "hash-a", { alliance_id: 99005338 });
    const second = corporation(2000, "hash-b", { alliance_id: 99005338 });
    const alliance = allianceOf(99005338, 1000);
    alliance.addCorporation(2000);
    const { actions, state } = actionsOver([first, second], [], [alliance]);

    actions.removeCharacterFromCorporations("hash-a");

    expect(state.account.corporations).toEqual([second]);
    expect(state.account.alliances).toEqual([alliance]);
    expect(alliance.corporations).toEqual([2000]);
  });

  it("drops the alliance once its last corporation has gone", () => {
    const only = corporation(1000, "hash-a", { alliance_id: 99005338 });
    const { actions, state } = actionsOver(
      [only],
      [],
      [allianceOf(99005338, 1000)],
    );

    actions.removeCharacterFromCorporations("hash-a");

    expect(state.account.corporations).toEqual([]);
    expect(state.account.alliances).toEqual([]);
  });

  it("leaves the alliances alone for a corporation in none", () => {
    const loner = corporation(3000, "hash-c");
    const alliance = allianceOf(99005338, 1000);
    const { actions, state } = actionsOver([loner], [], [alliance]);

    actions.removeCharacterFromCorporations("hash-c");

    expect(state.account.corporations).toEqual([]);
    expect(state.account.alliances).toEqual([alliance]);
  });
});
