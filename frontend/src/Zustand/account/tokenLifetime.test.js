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

// Tokens outlive the store slices now, so nothing drops them implicitly. Anything that ends a
// character's session has to say so.
describe("held tokens do not outlive their character", () => {
  beforeEach(() => {
    esiCredentials.reset();
    esiCredentials.adoptEsiAccessToken(
      "owner-hash",
      esiAccessToken({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    useUsersStore.setState((s) => ({
      account: {
        ...s.account,
        characters: [
          {
            isMainCharacter: true,
            isPlaceholder: false,
            CharacterHash: "owner-hash",
          },
        ],
        actions: s.account.actions,
      },
    }));
  });

  it("drops the token when the character is removed from the roster", () => {
    expect(esiCredentials.heldEsiAccessToken("owner-hash")).not.toBe("");

    useUsersStore.getState().account.actions.removeCharacter({
      CharacterHash: "owner-hash",
    });

    expect(esiCredentials.heldEsiAccessToken("owner-hash")).toBe("");
  });
});
