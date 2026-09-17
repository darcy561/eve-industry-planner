import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { activePlannerStoreState } from "../tests/utils.js";
import { makeFakeWebSocket } from "../tests/fakeWebSocket.js";
import { DOCUMENT_LOCK_FRAME_TYPES } from "../Functions/DocumentLock/documentLockEvents.js";

const storeState = activePlannerStoreState();

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
vi.mock("../Functions/Endpoints/Private/applyPrivateHeaders.js", () => ({
  getSessionIDFromStore: () => "session-1",
}));
vi.mock("../Functions/DocumentLoad/loadPlannerDocuments.js", () => ({
  loadPlannerDocuments: vi.fn(),
}));
vi.mock("../Functions/DocumentLoad/loadAccountDocuments.js", () => ({
  loadAccountDocuments: vi.fn(),
}));
vi.mock("../Functions/App/appVersionCheck.js", () => ({
  considerRemoteAppVersion: vi.fn(),
  isClientAppVersionOutdated: () => false,
}));
vi.mock("../WebSocket/applyRemoteMessage.js", () => ({
  applyRemoteMessage: vi.fn(),
}));
vi.mock("../Events/appConfigEvents.js", () => ({
  requestAppConfigRecheck: vi.fn(),
  subscribeToAppConfigRecheck: () => () => {},
}));
vi.mock("./wsClientIdentity.js", () => ({
  clearWsClientID: vi.fn(),
  clearWsClientIdentityHard: vi.fn(),
  getWsClientID: () => null,
  setWsClientID: vi.fn(),
}));

const sent = [];

const {
  connectWebsocket,
  disconnectWebsocket,
  sendDocumentLockEphemeralCommand,
} = await import("./websocketClient.js");

beforeEach(() => {
  sent.length = 0;
  storeState.activePlanner.owner = null;
  storeState.account.accountID = "acct-1";
  vi.stubGlobal("WebSocket", makeFakeWebSocket({ sent }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  connectWebsocket({ accountId: "acct-1" });
});

afterEach(() => {
  disconnectWebsocket();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A lock frame names the planner it is for, rather than leaving the server to
// read the planner it last recorded for the connection. What the server does
// with the name is proven over real sockets in the websocket service.
describe("naming the planner on a lock frame", () => {
  it("carries the planner the app is working in", () => {
    storeState.activePlanner.owner = "corporation:98000001";

    const queued = sendDocumentLockEphemeralCommand(
      DOCUMENT_LOCK_FRAME_TYPES.WAITLIST_PULSE,
      "job_documents",
      "j1",
    );

    expect(queued).toBe(true);
    expect(sent.at(-1)).toMatchObject({
      type: DOCUMENT_LOCK_FRAME_TYPES.WAITLIST_PULSE,
      collection: "job_documents",
      docID: "j1",
      owner: "corporation:98000001",
    });
  });

  // The common case: nothing is named until the switcher is used, and an account
  // working alone never uses it. Reading the field rather than the accessor here
  // would send nothing at all and quietly leave every lock on the HTTP path.
  it("names the account's own planner when nothing was switched to", () => {
    const queued = sendDocumentLockEphemeralCommand(
      DOCUMENT_LOCK_FRAME_TYPES.WAITLIST_PULSE,
      "job_documents",
      "j1",
    );

    expect(queued).toBe(true);
    expect(sent.at(-1)).toMatchObject({ owner: "account:acct-1" });
  });

  // Signed out there is no planner to name and nothing to guess from.
  it("sends nothing with nobody signed in", () => {
    storeState.account.accountID = null;

    const queued = sendDocumentLockEphemeralCommand(
      DOCUMENT_LOCK_FRAME_TYPES.WAITLIST_PULSE,
      "job_documents",
      "j1",
    );

    expect(queued).toBe(false);
    expect(
      sent.filter((f) => f.type === DOCUMENT_LOCK_FRAME_TYPES.WAITLIST_PULSE),
    ).toHaveLength(0);
  });
});
