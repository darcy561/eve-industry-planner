import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClientRefresh, mockServerBatch } = vi.hoisted(() => ({
  mockClientRefresh: vi.fn(),
  mockServerBatch: vi.fn(),
}));
vi.mock("../../Endpoints/esiAccessClient.js", () => ({
  requestEsiAccessFromClientRefreshSecret: mockClientRefresh,
  requestEsiAccessFromServerStorageBatch: mockServerBatch,
}));

import useUsersStore from "../../../Zustand/usersStore.js";
import esiCredentials, { getEsiAccessToken } from "./provider.js";
import { esiAccessToken } from "../../../tests/utils.js";

const HASH = "owner-hash";

function seed({
  userCloudAccounts,
  esiRefreshToken = "secret-1",
  isMainCharacter = true,
}) {
  useUsersStore.setState((s) => ({
    applicationSettings: {
      ...s.applicationSettings,
      userCloudAccounts,
      actions: s.applicationSettings.actions,
    },
    account: {
      ...s.account,
      characters: [
        {
          CharacterHash: HASH,
          isPlaceholder: false,
          isMainCharacter,
          esiRefreshToken,
        },
      ],
      actions: s.account.actions,
    },
  }));
}

describe("the wired provider", () => {
  const fresh = () =>
    esiAccessToken({ exp: Math.floor(Date.now() / 1000) + 3600 });

  beforeEach(() => {
    esiCredentials.reset();
    mockClientRefresh.mockReset();
    mockServerBatch.mockReset();
    localStorage.clear();
  });

  it("uses server storage for a cloud account", async () => {
    seed({ userCloudAccounts: true });
    mockServerBatch.mockResolvedValue({
      tokens: [{ character_hash: HASH, access_token: fresh() }],
    });

    await getEsiAccessToken(HASH);

    expect(mockServerBatch).toHaveBeenCalledWith([HASH]);
    expect(mockClientRefresh).not.toHaveBeenCalled();
  });

  it("uses the roster's refresh secret for a local account", async () => {
    seed({ userCloudAccounts: false, esiRefreshToken: "secret-1" });
    mockClientRefresh.mockResolvedValue({ access_token: fresh() });

    await getEsiAccessToken(HASH);

    expect(mockClientRefresh).toHaveBeenCalledWith("secret-1");
    expect(mockServerBatch).not.toHaveBeenCalled();
  });

  // The mode can change while the app runs, so it is read per call rather than captured at boot.
  it("follows a switch from local to cloud without a reload", async () => {
    seed({ userCloudAccounts: false });
    mockClientRefresh.mockResolvedValue({ access_token: fresh() });
    await getEsiAccessToken(HASH);

    esiCredentials.reset();
    seed({ userCloudAccounts: true });
    mockServerBatch.mockResolvedValue({
      tokens: [{ character_hash: HASH, access_token: fresh() }],
    });
    await getEsiAccessToken(HASH);

    expect(mockServerBatch).toHaveBeenCalledTimes(1);
  });

  // A rotated secret has to reach localStorage: it is what a cold reload resumes the main
  // character from, and the in-memory copy dies with the tab.
  it("writes a rotated secret to the roster and to the resume slot", async () => {
    seed({ userCloudAccounts: false, isMainCharacter: true });
    mockClientRefresh.mockResolvedValue({
      access_token: fresh(),
      refresh_token: "secret-2",
    });

    await getEsiAccessToken(HASH);

    const [character] = useUsersStore.getState().account.characters;
    expect(character.esiRefreshToken).toBe("secret-2");
    expect(localStorage.getItem("Auth")).toBe("secret-2");
  });

  it("does not write the resume slot for an alt", async () => {
    seed({ userCloudAccounts: false, isMainCharacter: false });
    mockClientRefresh.mockResolvedValue({
      access_token: fresh(),
      refresh_token: "secret-2",
    });

    await getEsiAccessToken(HASH);

    expect(useUsersStore.getState().account.characters[0].esiRefreshToken).toBe(
      "secret-2",
    );
    expect(localStorage.getItem("Auth")).toBeNull();
  });

  // Private-browsing and blocked-storage modes throw on write; the rotated secret is still in
  // memory, so the refresh must succeed rather than take the tab down.
  it("survives a resume slot that cannot be written", async () => {
    seed({ userCloudAccounts: false, isMainCharacter: true });
    mockClientRefresh.mockResolvedValue({
      access_token: fresh(),
      refresh_token: "secret-2",
    });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    await expect(getEsiAccessToken(HASH)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
    expect(useUsersStore.getState().account.characters[0].esiRefreshToken).toBe(
      "secret-2",
    );

    setItem.mockRestore();
  });

  it("ignores a rotation for a character no longer on the roster", async () => {
    seed({ userCloudAccounts: false });
    mockClientRefresh.mockResolvedValue({
      access_token: fresh(),
      refresh_token: "secret-2",
    });
    useUsersStore.setState((s) => ({
      account: { ...s.account, characters: [], actions: s.account.actions },
    }));

    await expect(getEsiAccessToken(HASH)).rejects.toMatchObject({
      classification: "reauth_required",
    });
  });

  it("needs a full login when the roster holds no secret", async () => {
    seed({ userCloudAccounts: false, esiRefreshToken: "" });

    await expect(getEsiAccessToken(HASH)).rejects.toMatchObject({
      classification: "reauth_required",
    });
    expect(mockClientRefresh).not.toHaveBeenCalled();
  });
});
