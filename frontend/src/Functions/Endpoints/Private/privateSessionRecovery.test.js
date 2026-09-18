import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnsurePlannerSession, mockEnforceReauthDemand } = vi.hoisted(
  () => ({
    mockEnsurePlannerSession: vi.fn().mockResolvedValue(undefined),
    mockEnforceReauthDemand: vi.fn(
      (signal) => signal === "reauth_required" || signal === "session_revoked",
    ),
  }),
);

vi.mock("../../Auth/plannerSessionRedirect.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceReauthDemand: mockEnforceReauthDemand,
}));

import useUsersStore from "../../../Zustand/usersStore.js";
import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import { TAB_SESSION_ID_KEY } from "../../Auth/tabSessionStorage.js";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("private requests and the planner session", () => {
  let fetchMock;

  beforeEach(() => {
    sessionStorage.setItem(TAB_SESSION_ID_KEY, "session-1");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockEnsurePlannerSession.mockClear().mockResolvedValue(undefined);
    mockEnforceReauthDemand.mockClear();
    useUsersStore.setState((s) => ({
      account: {
        ...s.account,
        sessionID: "session-1",
        actions: {
          ...s.account.actions,
          ensurePlannerSession: mockEnsurePlannerSession,
        },
      },
    }));
  });

  it("ensures the session before sending, and sends the tab session header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await requestWithPrivateHeaders("/api/v1/thing", {}, { retry: false });

    expect(mockEnsurePlannerSession).toHaveBeenCalled();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["X-Session-ID"]).toBe("session-1");
  });

  // The recovery that turns a lost session into one forced rotate rather than a failed request.
  it("forces one rotate and retries once on session_missing", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "session_missing" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await requestWithPrivateHeaders(
      "/api/v1/thing",
      {},
      { retry: false },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockEnsurePlannerSession).toHaveBeenCalledWith({ force: true });
  });

  // Without this the recovery would loop: retry, get session_missing, force, retry, forever.
  it("retries at most once when the session stays missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "session_missing" }));

    const res = await requestWithPrivateHeaders(
      "/api/v1/thing",
      {},
      { retry: false },
    );

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts a full EVE login on a terminal code instead of retrying", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: "session_revoked" }));

    await expect(
      requestWithPrivateHeaders("/api/v1/thing", {}, { retry: false }),
    ).rejects.toMatchObject({ status: 401 });

    expect(mockEnforceReauthDemand).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the session refresh when asked to", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await requestWithPrivateHeaders(
      "/api/v1/thing",
      {},
      { retry: false, skipSessionRefresh: true },
    );

    expect(mockEnsurePlannerSession).not.toHaveBeenCalled();
  });
});
