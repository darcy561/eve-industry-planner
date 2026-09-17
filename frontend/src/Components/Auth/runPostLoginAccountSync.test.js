import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrefetchCollections,
  mockBuildUsersFromRefreshTokens,
  mockHydrateLinkedCharacters,
  mockRefreshAccountSessionGrants,
} = vi.hoisted(() => ({
  mockPrefetchCollections: vi.fn().mockResolvedValue(undefined),
  mockBuildUsersFromRefreshTokens: vi.fn().mockResolvedValue([]),
  mockHydrateLinkedCharacters: vi.fn().mockResolvedValue([]),
  mockRefreshAccountSessionGrants: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../Functions/EveESI/prefetch/scheduler", () => ({
  prefetchCollections: mockPrefetchCollections,
}));
vi.mock("../../Functions/Auth/buildAccountData", () => ({
  buildUsersFromRefreshTokens: mockBuildUsersFromRefreshTokens,
  hydrateLinkedCharactersFromAccessSessions: mockHydrateLinkedCharacters,
  getSystemIndexDataFromUserStructures: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../Functions/Auth/refreshAccountSessionGrants.js", () => ({
  default: mockRefreshAccountSessionGrants,
}));
vi.mock("../../Functions/Debugging/queryWaterfallLogger", () => ({
  clearQueryTimings: vi.fn(),
}));
vi.mock("../../WebSocket/handlers/accountReconcile.js", () => ({
  enqueueReconcile: vi.fn(),
  reconcileAfterRemoteUserDoc: vi.fn(),
}));

import { runPostLoginAccountSync } from "./runPostLoginAccountSync.js";

const queryClient = { fetchQuery: vi.fn() };

describe("post-login account sync", () => {
  beforeEach(() => {
    mockPrefetchCollections.mockClear();
    mockBuildUsersFromRefreshTokens.mockClear().mockResolvedValue([]);
    mockHydrateLinkedCharacters.mockClear().mockResolvedValue([]);
    mockRefreshAccountSessionGrants.mockClear();
  });

  // The prefetch is imported rather than handed in, so this is what proves login still warms the
  // cache for the characters it just built.
  it("prefetches the characters it built", async () => {
    mockBuildUsersFromRefreshTokens.mockResolvedValue([
      { CharacterHash: "a" },
      { CharacterHash: "b" },
    ]);

    await runPostLoginAccountSync({
      queryClient,
      userDocument: { userCloudAccounts: false },
    });

    expect(mockPrefetchCollections).toHaveBeenCalledWith(
      queryClient,
      ["a", "b"],
      true,
    );
  });

  // Warming a cache must not hold up the rest of login: a prefetch that never answers would
  // otherwise stall the steps behind it.
  it("does not wait for the prefetch to finish", async () => {
    mockBuildUsersFromRefreshTokens.mockResolvedValue([{ CharacterHash: "a" }]);
    mockPrefetchCollections.mockReturnValue(new Promise(() => {}));

    await expect(
      runPostLoginAccountSync({
        queryClient,
        userDocument: { userCloudAccounts: false },
      }),
    ).resolves.toBeUndefined();
    expect(mockRefreshAccountSessionGrants).toHaveBeenCalled();
  });

  // Prefetching is warming a cache: login must not fail because ESI would not answer.
  it("completes when the prefetch rejects", async () => {
    mockBuildUsersFromRefreshTokens.mockResolvedValue([{ CharacterHash: "a" }]);
    mockPrefetchCollections.mockRejectedValue(new Error("esi down"));

    await expect(
      runPostLoginAccountSync({
        queryClient,
        userDocument: { userCloudAccounts: false },
      }),
    ).resolves.toBeUndefined();
    expect(mockRefreshAccountSessionGrants).toHaveBeenCalled();
  });

  it("does nothing when the login carried no user document", async () => {
    await runPostLoginAccountSync({ queryClient, userDocument: null });

    expect(mockPrefetchCollections).not.toHaveBeenCalled();
  });
});
