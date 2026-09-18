import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClientRefresh } = vi.hoisted(() => ({
  mockClientRefresh: vi.fn(),
}));
vi.mock("../../Functions/Endpoints/esiAccessClient.js", () => ({
  requestEsiAccessFromClientRefreshSecret: mockClientRefresh,
  requestEsiAccessFromServerStorage: vi.fn(),
  requestEsiAccessFromServerStorageBatch: vi.fn(),
}));

import useUsersStore from "../usersStore.js";
import esiCredentials from "../../Functions/Auth/esiCredentials/provider.js";
import { esiAccessToken } from "../../tests/utils.js";

describe("refreshing an ESI access token", () => {
  beforeEach(() => {
    esiCredentials.reset();
    mockClientRefresh.mockReset();
    useUsersStore.setState((s) => ({
      applicationSettings: {
        ...s.applicationSettings,
        userCloudAccounts: false,
        actions: s.applicationSettings.actions,
      },
      account: {
        ...s.account,
        isLoggedIn: true,
        characters: [
          {
            isMainCharacter: true,
            isPlaceholder: false,
            CharacterID: 1,
            CharacterHash: "owner-hash",
            esiRefreshToken: "refresh-secret",
          },
        ],
        actions: s.account.actions,
      },
    }));
  });

  // The whole point of holding tokens outside the store. 38 component call sites subscribe to
  // account.characters; a rotation that wrote the store would re-render every one of them for a
  // value none of them display.
  it("notifies no store subscriber", async () => {
    mockClientRefresh.mockResolvedValue({
      access_token: esiAccessToken({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
    const subscriber = vi.fn();
    const unsubscribe = useUsersStore.subscribe(subscriber);

    await esiCredentials.getEsiAccessToken("owner-hash");

    unsubscribe();
    expect(mockClientRefresh).toHaveBeenCalledTimes(1);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("keeps the token off the character", async () => {
    mockClientRefresh.mockResolvedValue({
      access_token: esiAccessToken({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });

    await esiCredentials.getEsiAccessToken("owner-hash");

    const [character] = useUsersStore.getState().account.characters;
    expect(character.esiAccessToken).toBeUndefined();
    expect(character.esiAccessTokenEXP).toBeUndefined();
  });
});
