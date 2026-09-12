import { beforeEach, describe, expect, it, vi } from "vitest";

const { forget } = vi.hoisted(() => ({ forget: vi.fn() }));

vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  default: { forget: (...args) => forget(...args) },
}));

const { characterActions } = await import("./characterActions.js");

/**
 * The actions as the store calls them: a `set` that applies the updater to a
 * local state object, and a `get` that reads it back. Nothing here builds the
 * real store — these actions only ever touch `account.characters`.
 *
 * @param {object[]} characters
 */
function actionsOver(characters) {
  const state = { account: { characters, actions: {} } };
  const get = () => state;
  const set = (updater) => {
    Object.assign(state, updater(state));
  };
  const actions = characterActions(set, get);
  state.account.actions = actions;
  return { actions, state };
}

/** @param {string} hash @param {object} [extra] */
function character(hash, extra = {}) {
  return { CharacterHash: hash, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("finding a character", () => {
  const main = character("main-hash", {
    isMainCharacter: true,
    CharacterName: "Main Pilot",
    CharacterID: 1,
    CorporationID: 900,
  });
  const alt = character("alt-hash", { CharacterID: 2, CorporationID: 901 });

  it("reads the main character and its name", () => {
    const { actions } = actionsOver([alt, main]);

    expect(actions.getMainCharacter()).toBe(main);
    expect(actions.getMainCharacterName()).toBe("Main Pilot");
  });

  it("answers null for a main character that is not there", () => {
    const { actions } = actionsOver([alt]);

    expect(actions.getMainCharacter()).toBeNull();
    expect(actions.getMainCharacterName()).toBeNull();
  });

  it("finds by hash and by id, and answers null for a miss", () => {
    const { actions } = actionsOver([main, alt]);

    expect(actions.findCharacterByHash("alt-hash")).toBe(alt);
    expect(actions.findCharacterByHash("nobody")).toBeNull();
    expect(actions.findCharacterById(1)).toBe(main);
    expect(actions.findCharacterById(99)).toBeNull();
  });

  // One id argument, two meanings — the flag is what says which, and getting it
  // wrong would match a corporation id against a character id.
  it("matches on corporation or character id as the flag says", () => {
    const { actions } = actionsOver([main, alt]);

    expect(actions.matchCharacterByIDorCorporationID(901, true)).toBe(alt);
    expect(actions.matchCharacterByIDorCorporationID(901, false)).toBeNull();
    expect(actions.matchCharacterByIDorCorporationID(2, false)).toBe(alt);
  });

  // `findCharacterByHash` compares raw, unlike the canonicalising paths below.
  it("does not find a hash spelled in another case", () => {
    const { actions } = actionsOver([character("AbC")]);

    expect(actions.findCharacterByHash("abc")).toBeNull();
  });
});

describe("adding characters", () => {
  it("appends a character the list does not hold", () => {
    const { actions, state } = actionsOver([character("one")]);

    actions.addCharacter(character("two"));

    expect(state.account.characters.map((c) => c.CharacterHash)).toEqual([
      "one",
      "two",
    ]);
  });

  // Realtime reconcile and the post-login sync both hydrate linked alts from the
  // same tokens, so the same character arrives twice and must not be duplicated.
  it("replaces a row whose hash differs only in case", () => {
    const existing = character("AbC", { CharacterName: "Stale" });
    const { actions, state } = actionsOver([existing]);

    actions.addCharacter(character("abc", { CharacterName: "Fresh" }));

    expect(state.account.characters).toHaveLength(1);
    expect(state.account.characters[0].CharacterName).toBe("Fresh");
  });

  it("adds several at once, replacing the ones already held", () => {
    const { actions, state } = actionsOver([
      character("keep"),
      character("OLD"),
    ]);

    actions.addCharacters([
      character("old", { CharacterName: "Replaced" }),
      character("new"),
    ]);

    expect(state.account.characters.map((c) => c.CharacterHash)).toEqual([
      "keep",
      "old",
      "new",
    ]);
    expect(state.account.characters[1].CharacterName).toBe("Replaced");
  });

  it("ignores rows carrying no usable hash", () => {
    const { actions, state } = actionsOver([character("one")]);

    actions.addCharacters([null, {}, character("  "), "a string"]);

    expect(state.account.characters).toHaveLength(1);
  });

  it("replaces the whole list outright", () => {
    const { actions, state } = actionsOver([character("one")]);

    actions.updateCharacters([character("two")]);

    expect(state.account.characters.map((c) => c.CharacterHash)).toEqual([
      "two",
    ]);
  });
});

describe("removing a character", () => {
  it("drops it and forgets its held credentials", () => {
    const { actions, state } = actionsOver([
      character("one"),
      character("two"),
    ]);

    actions.removeCharacter(character("two"));

    expect(state.account.characters.map((c) => c.CharacterHash)).toEqual([
      "one",
    ]);
    expect(forget).toHaveBeenCalledWith("two");
  });

  it("removes a row whose hash is spelled in another case", () => {
    const { actions, state } = actionsOver([character("AbC")]);

    actions.removeCharacter(character("abc"));

    expect(state.account.characters).toEqual([]);
  });

  // Removing nothing must not clear the roster, and must not drop a live token.
  it.each([undefined, {}, { CharacterHash: "" }, { CharacterHash: "  " }])(
    "leaves the list alone for %s",
    (input) => {
      const { actions, state } = actionsOver([character("one")]);

      actions.removeCharacter(input);

      expect(state.account.characters).toHaveLength(1);
      expect(forget).not.toHaveBeenCalled();
    },
  );
});
