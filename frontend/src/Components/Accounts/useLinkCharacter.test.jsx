import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../tests/queryClients.js";

const getEveOauthToken = vi.fn();
const addCharacter = vi.fn();
const submitCloudLinkedCharacterRefreshTokens = vi.fn(async () => {});
const updateLocalRefreshTokens = vi.fn();
const buildCharacterAffiliations = vi.fn(async () => {});
const prefetchCollections = vi.fn(async () => {});
const snackbarError = vi.fn();
const snackbarSuccess = vi.fn();
const startSignIn = vi.fn(async () => "a-sign-in-state");

let characters = [];
let cloudAccounts = false;
/** The listener the popup would call back on, captured so a test can answer as EVE would. */
let onAuthCode = null;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: { characters, actions: { addCharacter } },
      applicationSettings: { userCloudAccounts: cloudAccounts },
    }),
  );
});

vi.mock("../../Functions/EveESI/Character/getEveSSOToken", () => ({
  default: (...args) => getEveOauthToken(...args),
}));
// Linking exchanges a code, so it proves this browser started the sign-in the same
// way the main login does. The mint itself is the API's; what matters here is that
// linking waits for it.
vi.mock("../../Functions/Auth/signInState.js", () => ({
  startSignIn: (...args) => startSignIn(...args),
}));
vi.mock("../../Functions/Auth/linkedCharacterTokens.js", () => ({
  submitCloudLinkedCharacterRefreshTokens: (...args) =>
    submitCloudLinkedCharacterRefreshTokens(...args),
}));
vi.mock("../../Functions/Auth/buildAccountData", () => ({
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));
// The real one: it writes the roster entry and, for the main character, the key a cold reload
// resumes from. That second write is the thing under test below.
vi.mock("../../Functions/Auth/esiCredentials/provider.js", async () => {
  const { canonicalCharacterHashKey } =
    await import("../../Functions/Auth/characterHashCanonical.js");
  return {
    writeClientSecret: (hash, secret) => {
      const held = characters.find(
        (c) =>
          canonicalCharacterHashKey(c?.CharacterHash) ===
          canonicalCharacterHashKey(hash),
      );
      if (!held) return;
      held.esiRefreshToken = secret;
      if (held.isMainCharacter) window.localStorage.setItem("Auth", secret);
    },
  };
});
vi.mock("../../Functions/Auth/characterAffiliations", () => ({
  buildCharacterAffiliations: (...args) => buildCharacterAffiliations(...args),
}));
vi.mock("../../Functions/EveESI/prefetch/scheduler", () => ({
  prefetchCollections: (...args) => prefetchCollections(...args),
}));
vi.mock("../../Functions/Auth/refreshAccountSessionGrants.js", () => ({
  default: vi.fn(async () => {}),
}));
vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
  flushPendingUserDocumentSaves: vi.fn(async () => {}),
}));
vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarError: (...args) => snackbarError(...args),
  showSnackbarSuccess: (...args) => snackbarSuccess(...args),
  showSnackbarInfo: vi.fn(),
}));
vi.mock("../Auth/additionalAccountImport.js", () => ({
  buildAdditionalAccountState: () => "state",
  subscribeToAdditionalUserAuthCode: (options) => {
    onAuthCode = options.onAuthCode;
    return vi.fn();
  },
  watchForClosedImportPopup: () => vi.fn(),
}));
vi.mock("../Auth/Functions/eveSSORedirect", () => ({
  getEveSsoAuthorizeUrl: () => "https://login.eveonline.com/authorize",
}));
const trackAppEvent = vi.fn();
vi.mock("../../analytics/trackAppEvent", () => ({
  trackAppEvent: (...args) => trackAppEvent(...args),
}));

const { useLinkCharacter } = await import("./useLinkCharacter.js");

function aCharacter(overrides = {}) {
  return {
    CharacterHash: "hash-1",
    CharacterName: "Oswold Saraki",
    esiRefreshToken: "fresh-secret",
    ...overrides,
  };
}

/** Runs the flow as EVE would: the popup returns a code, and the exchange returns a character. */
async function linkAndAnswerWith(character, options) {
  const client = testQueryClient();
  const { result } = renderHook(() => useLinkCharacter(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  getEveOauthToken.mockResolvedValue(character);

  // Awaited: the sign-in state is minted before the popup opens, so the listener the
  // callback answers on is not attached until that resolves.
  await act(async () => {
    await result.current.linkCharacter(options);
  });
  await act(async () => {
    await onAuthCode("auth-code");
  });

  return result;
}

describe("linking a character through EVE SSO", () => {
  beforeEach(() => {
    characters = [];
    cloudAccounts = false;
    onAuthCode = null;
    vi.clearAllMocks();
    startSignIn.mockResolvedValue("a-sign-in-state");
    vi.stubGlobal("open", vi.fn());
  });

  // Without a state the exchange refuses, so opening the popup would walk the reader
  // through EVE to fail on the way back.
  it("does not open the popup when the sign-in cannot be started", async () => {
    startSignIn.mockRejectedValue(new Error("no state"));
    const client = testQueryClient();
    const { result } = renderHook(() => useLinkCharacter(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.linkCharacter();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(snackbarError).toHaveBeenCalled();
    expect(result.current.isLinking).toBe(false);
  });

  it("adds a character the account does not have", async () => {
    await linkAndAnswerWith(aCharacter());

    expect(buildCharacterAffiliations).toHaveBeenCalled();
    expect(addCharacter).toHaveBeenCalled();
    expect(updateLocalRefreshTokens).toHaveBeenCalled();
    expect(prefetchCollections).toHaveBeenCalled();
  });

  it("refuses a character the account already holds", async () => {
    characters = [aCharacter({ esiRefreshToken: "old-secret" })];

    await linkAndAnswerWith(aCharacter());

    expect(snackbarError).toHaveBeenCalledWith("Duplicate Account", 3);
    expect(addCharacter).not.toHaveBeenCalled();
  });

  // The whole point of linking again: the character stays where it is and only its spent secret
  // is replaced, so its cached ESI data and its place in the roster survive.
  it("replaces the secret of a character being linked again", async () => {
    const held = aCharacter({ esiRefreshToken: "spent-secret" });
    characters = [held];

    await linkAndAnswerWith(aCharacter(), { relinkHash: "hash-1" });

    expect(held.esiRefreshToken).toBe("fresh-secret");
    expect(addCharacter).not.toHaveBeenCalled();
    expect(snackbarError).not.toHaveBeenCalled();
    expect(snackbarSuccess).toHaveBeenCalledWith(
      "Oswold Saraki linked again",
      3,
    );
  });

  it("sends the replaced secret to the server in cloud mode", async () => {
    cloudAccounts = true;
    characters = [aCharacter({ esiRefreshToken: "spent-secret" })];

    await linkAndAnswerWith(aCharacter(), { relinkHash: "hash-1" });

    expect(submitCloudLinkedCharacterRefreshTokens).toHaveBeenCalledWith(
      new Map([["hash-1", "fresh-secret"]]),
    );
  });

  // Signing in as the wrong character must not quietly give one character another's credentials.
  it("refuses a sign-in as a different character", async () => {
    const held = aCharacter({ esiRefreshToken: "spent-secret" });
    characters = [held];

    await linkAndAnswerWith(
      aCharacter({ CharacterHash: "hash-2", CharacterName: "Someone Else" }),
      { relinkHash: "hash-1" },
    );

    expect(held.esiRefreshToken).toBe("spent-secret");
    expect(snackbarError).toHaveBeenCalledWith(
      expect.stringContaining("not the character being linked again"),
      4,
    );
  });

  it("reports a failed exchange rather than swallowing it", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});

    await linkAndAnswerWith(new Error("SSO refused"));

    expect(snackbarError).toHaveBeenCalledWith("SSO refused", 3);
    expect(addCharacter).not.toHaveBeenCalled();
    reported.mockRestore();
  });

  // `updateLocalRefreshTokens` writes only the linked characters' key; the main character's own
  // secret lives in `localStorage["Auth"]`, which is what a cold reload resumes from. Miss it and
  // the relink lasts until the tab closes.
  it("writes the main character's replaced secret where a reload will find it", async () => {
    const main = aCharacter({
      esiRefreshToken: "spent-secret",
      isMainCharacter: true,
    });
    characters = [main];
    window.localStorage.setItem("Auth", "spent-secret");

    await linkAndAnswerWith(aCharacter({ isMainCharacter: true }), {
      relinkHash: "hash-1",
    });

    expect(main.esiRefreshToken).toBe("fresh-secret");
    expect(window.localStorage.getItem("Auth")).toBe("fresh-secret");
  });

  // A character that was already in the roster is not a character being added.
  it("counts an add and does not count a relink", async () => {
    await linkAndAnswerWith(aCharacter());
    expect(trackAppEvent).toHaveBeenCalledTimes(1);

    trackAppEvent.mockClear();
    characters = [aCharacter({ esiRefreshToken: "spent-secret" })];

    await linkAndAnswerWith(aCharacter(), { relinkHash: "hash-1" });

    expect(trackAppEvent).not.toHaveBeenCalled();
  });

  // Every row calls this hook and so does the roster's own button: two sign-ins at once is two
  // popups the reader has to tell apart.
  it("lets only one sign-in be in flight for the account", () => {
    const client = testQueryClient();
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const roster = renderHook(() => useLinkCharacter(), { wrapper });
    const row = renderHook(() => useLinkCharacter(), { wrapper });

    act(() => {
      roster.result.current.linkCharacter();
    });

    expect(roster.result.current.isLinking).toBe(true);
    expect(row.result.current.isLinking).toBe(true);
  });
});
