import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateCorporationClaims, mockGetEsiAccessToken } = vi.hoisted(
  () => ({
    mockUpdateCorporationClaims: vi.fn(),
    mockGetEsiAccessToken: vi.fn(),
  }),
);
vi.mock("../Endpoints/Private/corporationClaims", () => ({
  default: mockUpdateCorporationClaims,
}));
vi.mock("./esiCredentials/provider.js", () => ({
  getEsiAccessToken: mockGetEsiAccessToken,
}));

import useUsersStore from "../../Zustand/usersStore.js";
import refreshAccountSessionGrants from "./refreshAccountSessionGrants.js";

function seedRoster(characters, { userCloudAccounts = false } = {}) {
  useUsersStore.setState((s) => ({
    applicationSettings: {
      ...s.applicationSettings,
      userCloudAccounts,
      actions: s.applicationSettings.actions,
    },
    account: { ...s.account, characters, actions: s.account.actions },
  }));
}

describe("refreshing account session grants", () => {
  beforeEach(() => {
    mockUpdateCorporationClaims.mockReset().mockResolvedValue(undefined);
    mockGetEsiAccessToken.mockReset();
  });

  it("submits one token per character", async () => {
    seedRoster([
      { CharacterHash: "a", isPlaceholder: false },
      { CharacterHash: "b", isPlaceholder: false },
    ]);
    mockGetEsiAccessToken.mockImplementation(async (hash) => ({
      accessToken: `token-${hash}`,
    }));

    await refreshAccountSessionGrants();

    expect(mockUpdateCorporationClaims).toHaveBeenCalledWith([
      "token-a",
      "token-b",
    ]);
  });

  // One character's credentials being dead must not stop the others' grants being refreshed.
  it("submits the tokens it could acquire when one character fails", async () => {
    seedRoster([
      { CharacterHash: "a", isPlaceholder: false },
      { CharacterHash: "b", isPlaceholder: false },
    ]);
    mockGetEsiAccessToken.mockImplementation(async (hash) => {
      if (hash === "a") throw new Error("dead");
      return { accessToken: "token-b" };
    });

    await refreshAccountSessionGrants();

    expect(mockUpdateCorporationClaims).toHaveBeenCalledWith(["token-b"]);
  });

  it("does not call the API when no token can be acquired", async () => {
    seedRoster([{ CharacterHash: "a", isPlaceholder: false }]);
    mockGetEsiAccessToken.mockRejectedValue(new Error("dead"));

    await refreshAccountSessionGrants();

    expect(mockUpdateCorporationClaims).not.toHaveBeenCalled();
  });

  it("skips placeholder rows and characters without a hash", async () => {
    seedRoster([
      { CharacterHash: "a", isPlaceholder: true },
      { CharacterHash: "", isPlaceholder: false },
    ]);

    await refreshAccountSessionGrants();

    expect(mockGetEsiAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateCorporationClaims).not.toHaveBeenCalled();
  });

  // Cloud accounts have their grants refreshed server-side during login and rotate.
  it("does nothing for cloud accounts", async () => {
    seedRoster([{ CharacterHash: "a", isPlaceholder: false }], {
      userCloudAccounts: true,
    });

    await refreshAccountSessionGrants();

    expect(mockGetEsiAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateCorporationClaims).not.toHaveBeenCalled();
  });
});
