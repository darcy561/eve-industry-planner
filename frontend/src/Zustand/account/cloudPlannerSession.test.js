import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetEsiAccessToken, mockHeldEsiAccessToken, mockRedirectToEveSSO } =
  vi.hoisted(() => ({
    mockGetEsiAccessToken: vi.fn(),
    mockHeldEsiAccessToken: vi.fn(() => ""),
    mockRedirectToEveSSO: vi.fn(),
  }));
vi.mock("../../Functions/Auth/esiCredentials/provider.js", () => ({
  getEsiAccessToken: mockGetEsiAccessToken,
  heldEsiAccessToken: mockHeldEsiAccessToken,
}));
vi.mock("../../Components/Auth/Functions/eveSSORedirect", () => ({
  default: mockRedirectToEveSSO,
}));

import useUsersStore from "../usersStore.js";
import {
  TAB_REFRESH_TOKEN_KEY,
  TAB_SESSION_ID_KEY,
} from "../../Functions/Auth/tabSessionStorage.js";
import {
  ESI_CREDENTIAL_REAUTH_REQUIRED,
  ESI_CREDENTIAL_RECOVERABLE,
  EsiCredentialError,
} from "../../Functions/Auth/esiCredentials/errors.js";

const ROTATE_URL = "/api/v1/auth/sessions/rotate";

function seed({ userCloudAccounts }) {
  useUsersStore.setState((s) => ({
    applicationSettings: {
      ...s.applicationSettings,
      userCloudAccounts,
      actions: s.applicationSettings.actions,
    },
    account: {
      ...s.account,
      isLoggedIn: true,
      accountID: "account-1",
      sessionID: "session-1",
      lastPlannerSessionValidatedAt: null,
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
}

describe("rotating without an ESI token in hand", () => {
  let fetchMock;

  beforeEach(() => {
    sessionStorage.setItem(TAB_SESSION_ID_KEY, "session-1");
    sessionStorage.setItem(TAB_REFRESH_TOKEN_KEY, "tab-refresh");
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: "session-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mockGetEsiAccessToken.mockReset();
    mockRedirectToEveSSO.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  // Cloud accounts can rotate on the cookie plus Mongo-stored ESI material, so a token the client
  // cannot produce is not fatal — it sends an empty eve_token and lets the server use storage.
  it("rotates a cloud account with an empty eve_token", async () => {
    seed({ userCloudAccounts: true });
    mockGetEsiAccessToken.mockRejectedValue(
      new EsiCredentialError("no material", ESI_CREDENTIAL_RECOVERABLE),
    );

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ROTATE_URL);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).eve_token).toBe("");
    expect(mockRedirectToEveSSO).not.toHaveBeenCalled();
  });

  it("sends the acquired token when a cloud account has one", async () => {
    seed({ userCloudAccounts: true });
    mockGetEsiAccessToken.mockResolvedValue({
      accessToken: "cloud-token",
      exp: 1,
    });

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).eve_token).toBe(
      "cloud-token",
    );
  });

  // Local accounts have no server-side fallback: without a token there is nothing to rotate with.
  it("does not rotate a local account with no token", async () => {
    seed({ userCloudAccounts: false });
    mockGetEsiAccessToken.mockRejectedValue(
      new EsiCredentialError("network", ESI_CREDENTIAL_RECOVERABLE),
    );

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedirectToEveSSO).not.toHaveBeenCalled();
  });

  it("starts a full login when a local account's credentials are dead", async () => {
    seed({ userCloudAccounts: false });
    mockGetEsiAccessToken.mockRejectedValue(
      new EsiCredentialError("dead", ESI_CREDENTIAL_REAUTH_REQUIRED),
    );

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedirectToEveSSO).toHaveBeenCalledTimes(1);
  });
});
