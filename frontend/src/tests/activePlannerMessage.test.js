import { describe, it, expect, vi, beforeEach } from "vitest";
import { activePlannerStoreState } from "./utils.js";

const storeState = activePlannerStoreState();

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
vi.mock("../Functions/Endpoints/Private/applyPrivateHeaders.js", () => ({
  getSessionIDFromStore: () => "session-1",
}));
vi.mock("../Functions/Endpoints/Private/jobDocuments.js", () => ({
  fetchPlannerJobDocumentsFromApi: vi.fn(),
}));
vi.mock("../Functions/App/appVersionCheck.js", () => ({
  considerRemoteAppVersion: vi.fn(),
  isClientAppVersionOutdated: () => false,
}));
vi.mock("../Realtime/applyRemoteMessage.js", () => ({
  applyRemoteMessage: vi.fn(),
}));
vi.mock("../Events/appConfigEvents.js", () => ({
  requestAppConfigRecheck: vi.fn(),
}));
vi.mock("../Realtime/syncAccountDocumentsFromServer.js", () => ({
  syncAccountDocumentsFromServer: vi.fn(),
}));
vi.mock("../Realtime/wsClientIdentity.js", () => ({
  clearRealtimeClientID: vi.fn(),
  clearRealtimeClientIdentityHard: vi.fn(),
  getRealtimeClientID: () => null,
  setRealtimeClientID: vi.fn(),
}));

const { sendActivePlanner, restoreActivePlanner } =
  await import("../Realtime/realtimeClient.js");

beforeEach(() => {
  storeState.activePlanner.owner = null;
});

// No socket is open in these, so a write cannot be queued. That is the case
// worth pinning: the planner the app reads for must not move to one the
// connection was never told about.
describe("naming the active planner", () => {
  it("holds nothing when the socket did not take the message", () => {
    expect(sendActivePlanner("corporation:98000001")).toBe(false);
    expect(storeState.activePlanner.owner).toBeNull();
  });

  it("names no planner without a handle", () => {
    expect(sendActivePlanner("")).toBe(false);
    expect(storeState.activePlanner.owner).toBeNull();
  });

  // A reconnect re-sends what the client chose, and an account working in its
  // own planner chose nothing — the server already delivers it.
  it("re-sends nothing when no planner was chosen", () => {
    expect(restoreActivePlanner()).toBe(false);
  });
});
