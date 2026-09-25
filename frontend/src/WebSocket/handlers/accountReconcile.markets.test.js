import { beforeEach, describe, expect, it, vi } from "vitest";

const readSavedMarketsNow = vi.fn();
const buildAccountDataFromRefreshTokenCandidates = vi.fn();

vi.mock("../../Functions/MarketData/prices/priceRefreshSchedule", () => ({
  readSavedMarketsNow: (...args) => readSavedMarketsNow(...args),
}));

vi.mock("../../Functions/Auth/buildAccountData.js", () => ({
  buildAccountDataFromRefreshTokenCandidates: (...args) =>
    buildAccountDataFromRefreshTokenCandidates(...args),
  buildCharacterFromCloudStoredAccess: vi.fn(),
  canonicalCharacterHashKey: (hash) => String(hash ?? "").toLowerCase(),
  getSystemIndexDataFromUserStructures: vi.fn(),
  groupRefreshTokensByCharacterHash: (tokens) =>
    new Map(
      (tokens ?? []).map((token) => [
        String(token.CharacterHash).toLowerCase(),
        { rTokens: [token], representativeCharacterHash: token.CharacterHash },
      ]),
    ),
  updateLocalRefreshTokensIfAccountHasAdditionalCharacters: vi.fn(),
}));

vi.mock(
  "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js",
  () => ({
    getCloudStoredEsiRefreshTokens: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  isCombinedUserAccountSaveDebouncePending: () => false,
}));

let cloudAccount = true;

/** What the reconcile does to the roster, which this test does not assert on. */
const accountActions = {
  addCharacter: vi.fn(),
  removeCharacter: vi.fn(),
  removeCharacterFromCorporations: vi.fn(),
  updateCharacters: vi.fn(),
  updateCharacterRefreshToken: vi.fn(),
  setCharacterRefreshToken: vi.fn(),
};

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        accountID: "acc-1",
        characters: [
          {
            CharacterHash: "hash-main",
            CharacterName: "Main",
            isMainCharacter: true,
          },
        ],
        linkedBootstrapHydrationPending: false,
        actions: accountActions,
      },
      applicationSettings: { userCloudAccounts: cloudAccount },
    }),
  );
});

const { reconcileAfterRemoteUserDoc } = await import("./accountReconcile.js");

const rosterLanded = {
  prevLinkedTokens: [],
  refreshTokensChanged: true,
  linkedCharactersChanged: true,
};

beforeEach(() => {
  readSavedMarketsNow.mockClear();
  cloudAccount = true;
  buildAccountDataFromRefreshTokenCandidates.mockResolvedValue({
    CharacterHash: "hash-alt",
    CharacterName: "Alt",
  });
});

// A market only its own reader can read needs a character to read it with, and
// a cloud account's characters arrive after login rather than during it. Without
// this the markets that could not be read wait for the next tick, a quarter of
// an hour of a reader looking at figures that are not there.
describe("a cloud account's roster landing", () => {
  it("reads the markets only that account can read", async () => {
    await reconcileAfterRemoteUserDoc(rosterLanded, {
      refreshTokens: [{ CharacterHash: "hash-alt", rToken: "token-alt" }],
    });

    expect(readSavedMarketsNow).toHaveBeenCalledTimes(1);
  });

  // The reconcile runs on every users-doc update, most of which say nothing
  // about the roster and leave early. Reading a market on each of those spends
  // the reader's own ESI allowance for nothing.
  it("asks for nothing when the account is not a cloud account", async () => {
    cloudAccount = false;

    await reconcileAfterRemoteUserDoc(rosterLanded, {
      refreshTokens: [{ CharacterHash: "hash-alt", rToken: "token-alt" }],
    });

    expect(readSavedMarketsNow).not.toHaveBeenCalled();
  });

  // The reconcile is driven by a snapshot that hardcodes "the roster may have
  // changed" — a tab refocus and a socket reconnect both take that path — so
  // reaching the end of it says nothing about whether anybody was added or
  // removed. Reading on each of those is a full probe of the reader's own
  // structures every time they alt-tab back.
  it("asks for nothing when the roster reached the end unchanged", async () => {
    await reconcileAfterRemoteUserDoc(rosterLanded, {
      refreshTokens: [{ CharacterHash: "hash-main", rToken: "token-main" }],
    });

    expect(readSavedMarketsNow).not.toHaveBeenCalled();
  });

  it("asks for nothing when the update says nothing about the roster", async () => {
    await reconcileAfterRemoteUserDoc(
      { prevLinkedTokens: [] },
      { userCloudAccounts: true },
    );

    expect(readSavedMarketsNow).not.toHaveBeenCalled();
  });
});
