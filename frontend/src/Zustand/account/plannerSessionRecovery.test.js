import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the browser-navigation leaf is stubbed. Everything between the HTTP response and the decision
// to redirect — code parsing in sessionClient, terminal classification, the store action's catch —
// is the real code, because that chain is what the defect lived in.
const { mockRedirectToEveSSO } = vi.hoisted(() => ({
  mockRedirectToEveSSO: vi.fn(),
}));
vi.mock("../../Components/Auth/Functions/eveSSORedirect", () => ({
  default: mockRedirectToEveSSO,
}));
vi.mock("../../Functions/Endpoints/Private/corporationClaims.js", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

import useUsersStore from "../usersStore.js";
import esiCredentials from "../../Functions/Auth/esiCredentials/provider.js";
import {
  TAB_REAUTH_REQUIRED_AT_KEY,
  TAB_REFRESH_TOKEN_KEY,
  TAB_SESSION_ID_KEY,
} from "../../Functions/Auth/tabSessionStorage.js";
import { esiAccessToken } from "../../tests/utils.js";

const ROTATE_URL = "/api/v1/auth/sessions/rotate";

/** A logged-in local account whose ESI access token is fresh, so rotate proceeds to HTTP. */
function seedLoggedInAccount() {
  const nowSec = Math.floor(Date.now() / 1000);
  esiCredentials.reset();
  esiCredentials.adoptEsiAccessToken(
    "owner-hash",
    esiAccessToken({ exp: nowSec + 3600 }),
  );
  useUsersStore.setState((s) => ({
    ...s,
    applicationSettings: {
      ...s.applicationSettings,
      userCloudAccounts: false,
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

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("planner session recovery", () => {
  let fetchMock;

  beforeEach(() => {
    sessionStorage.setItem(TAB_SESSION_ID_KEY, "session-1");
    sessionStorage.setItem(TAB_REFRESH_TOKEN_KEY, "dead-refresh-token");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // The redirect is a module-level mock, so a test that asserts nothing redirected
    // reads the previous test's redirect without this.
    mockRedirectToEveSSO.mockClear();
    seedLoggedInAccount();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  // The server answer produced by the rotate handler when a refresh token has been rotated away.
  it("starts a full EVE login when rotate reports the session revoked", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: "session_revoked", message: "Unauthorized" }),
    );

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ROTATE_URL);
    expect(mockRedirectToEveSSO).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBeNull();
  });

  // The consolidation made the deadline a reauth demand like any other, so this is the
  // one path where a rotate is refused before any HTTP happens at all.
  it("starts a full EVE login instead of rotating past the reauth deadline", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    sessionStorage.setItem(TAB_REAUTH_REQUIRED_AT_KEY, String(past));

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedirectToEveSSO).toHaveBeenCalledTimes(1);
  });

  // The pre-fix server behaviour: an uncoded 401. Nothing can classify it, so the tab keeps its dead
  // credential — this test exists to pin that such a response is no longer produced, and to document
  // what it costs if one ever is.
  it("cannot recover from an uncoded rejection", async () => {
    fetchMock.mockResolvedValue(
      new Response("Invalid token\n", { status: 401 }),
    );

    await useUsersStore.getState().account.actions.ensurePlannerSession();

    expect(mockRedirectToEveSSO).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBe(
      "dead-refresh-token",
    );
  });

  // Only success writes lastPlannerSessionValidatedAt, so without a recorded failure the cooldown
  // stays elapsed and every private request retries the rotate.
  it("does not retry a failed rotate on the next call", async () => {
    fetchMock.mockResolvedValue(
      new Response("Invalid token\n", { status: 401 }),
    );
    const actions = useUsersStore.getState().account.actions;

    await actions.ensurePlannerSession();
    const afterFirst = fetchMock.mock.calls.length;

    await actions.ensurePlannerSession();
    await actions.ensurePlannerSession({ force: true });

    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it("rotates again once the backoff has elapsed", async () => {
    fetchMock.mockResolvedValue(
      new Response("Invalid token\n", { status: 401 }),
    );
    const actions = useUsersStore.getState().account.actions;

    await actions.ensurePlannerSession();
    const afterFirst = fetchMock.mock.calls.length;

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 1000);
    await actions.ensurePlannerSession();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("clears the recorded failure after a successful rotate", async () => {
    const actions = useUsersStore.getState().account.actions;
    fetchMock.mockResolvedValue(
      new Response("Invalid token\n", { status: 401 }),
    );
    await actions.ensurePlannerSession();

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 1000);
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        session_id: "session-2",
        refresh_token: "fresh-refresh-token",
      }),
    );
    await actions.ensurePlannerSession();
    const afterSuccess = fetchMock.mock.calls.length;

    await actions.ensurePlannerSession({ force: true });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterSuccess);
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBe(
      "fresh-refresh-token",
    );
  });
});
