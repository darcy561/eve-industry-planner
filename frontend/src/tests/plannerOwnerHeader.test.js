import { describe, expect, it, vi } from "vitest";
import { activePlannerStoreState } from "./utils.js";

const storeState = activePlannerStoreState();

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
vi.mock("../Realtime/wsClientIdentity.js", () => ({
  getRealtimeClientID: () => null,
}));
vi.mock("../Functions/Auth/tabSessionStorage.js", () => ({
  getTabPlannerSessionID: () => "session-1",
  tabPlannerSessionRequestHeaders: () => ({ "X-Session-ID": "session-1" }),
}));

const { applyPrivateHeaders } =
  await import("../Functions/Endpoints/Private/applyPrivateHeaders.js");

const CORP_OWNER = "corporation:98000001";

describe("the planner a scoped request works in", () => {
  // Every scoped read and write carries the header, so the planner is named in
  // one place rather than at each of the call sites that remembered to.
  it("is named on the request as a header", () => {
    storeState.activePlanner.owner = CORP_OWNER;

    const options = applyPrivateHeaders({}, {});

    expect(options.headers["X-Planner-Owner"]).toBe(CORP_OWNER);
    storeState.activePlanner.owner = null;
  });

  it("is the account's own planner until one is named", () => {
    const options = applyPrivateHeaders({}, {});

    expect(options.headers["X-Planner-Owner"]).toBe("account:acct-1");
  });

  // The planner works signed out, and the server resolves an absent header to
  // the caller's own planner, so a request naming nobody is left as it is.
  it("is left off when nobody is signed in", () => {
    storeState.account.accountID = "";

    const options = applyPrivateHeaders({}, {});

    expect(options.headers).not.toHaveProperty("X-Planner-Owner");
    storeState.account.accountID = "acct-1";
  });

  it("leaves the session and client headers alone", () => {
    const options = applyPrivateHeaders({}, { requestName: "getGroups" });

    expect(options.headers["X-Session-ID"]).toBe("session-1");
    expect(options.headers["X-Request-Name"]).toBe("getGroups");
  });

  // A signed-out user works on defaults and reads no planner document, so a
  // scoped key names no owner and nothing it gates fires.
  it("leaves a scoped query key without an owner when signed out", async () => {
    const { plannerQueryScope } =
      await import("../Hooks/React Query/Backend/plannerQueryScope.js");
    expect(plannerQueryScope("archive")[2]).toBe("account:acct-1");

    storeState.account.accountID = "";
    expect(plannerQueryScope("archive")[2]).toBe("");
    storeState.account.accountID = "acct-1";
  });
});
