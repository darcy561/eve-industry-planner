import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The whole way out: a reader signs out, and by the time they land back on the
 * front page nothing of the session they had is left anywhere.
 *
 * `/signout` tears down in `beforeLoad`, so arriving is the whole of it — there is
 * no page and no click to press. Only the edges are stood in for: the socket and
 * the network call the teardown makes. The store, the query cache, the coalesce
 * queue and the router are the real ones, because what is being pinned is the
 * order those four are touched in.
 */
const { edges } = vi.hoisted(() => ({
  edges: { steps: [], logoutFails: false },
}));

// Both modules keep the rest of their exports: the route tree reaches them through
// the store and the login flow, and a mock naming only what this test stands in for
// would leave those imports undefined.
vi.mock("../WebSocket/websocketClient.js", async (importOriginal) => ({
  ...(await importOriginal()),
  disconnectWebsocket: () => {
    edges.steps.push("socket closed");
  },
}));

vi.mock("../Functions/Auth/sessionClient.js", async (importOriginal) => ({
  ...(await importOriginal()),
  logoutPlannerSession: async () => {
    edges.steps.push("server told");
    if (edges.logoutFails) {
      throw new Error("logout refused");
    }
    return true;
  },
}));

const { default: useUsersStore } = await import("../Zustand/usersStore.js");
const { queryClient } = await import("../queryClient.js");
const { enterRoute } = await import("../tests/routerHarness.jsx");
const { enqueueInboundJobDocumentChange } =
  await import("../Functions/Debounce/inboundJobDocumentsCoalesce.js");
const { default: esiCredentials } =
  await import("../Functions/Auth/esiCredentials/provider.js");
const { esiAccessToken } = await import("../tests/utils.js");
const { SIGNOUT_INTENT } = await import("../Functions/Auth/signoutIntent.js");

/** Signing out is something the app does, so every test arrives the way the menu sends you. */
function signOut() {
  return enterRoute("/signout", { state: SIGNOUT_INTENT });
}

/** The coalesce queue waits this long before writing what arrived into the store. */
const COALESCE_FLUSH_MS = 80;

const CHARACTER_HASH = "hash-1";

/**
 * A reader partway through a session: signed in, past the first-login flow — which the
 * root guard sends an account back to before anything else — and holding one job.
 */
function signedInWithAJob() {
  const { setLoggedIn, setHasCompletedFirstLoginFlow } =
    useUsersStore.getState().account.actions;
  setLoggedIn(true);
  setHasCompletedFirstLoginFlow(true);
  useUsersStore.setState((state) => ({
    account: { ...state.account, accountID: "acc-1" },
    jobData: { ...state.jobData, jobArray: [{ jobID: "job-1" }] },
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  edges.steps = [];
  edges.logoutFails = false;
  sessionStorage.setItem("tab-session", "held");
  localStorage.setItem("Auth", "stored-esi-refresh");
  queryClient.setQueryData(["jobs"], ["job-1"]);
  signedInWithAJob();
});

afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
});

describe("signing out", () => {
  it("lands the reader back on the front page with the session gone", async () => {
    const { pathname } = await signOut();

    expect(pathname).toBe("/");

    const { account, jobData } = useUsersStore.getState();
    expect(account.isLoggedIn).toBe(false);
    expect(jobData.jobArray).toEqual([]);
  });

  it("empties the query cache and the browser's storage", async () => {
    await signOut();

    expect(queryClient.getQueryData(["jobs"])).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem("Auth")).toBeNull();
  });

  // ESI access tokens are held outside the store, so no slice reset reaches them.
  it("drops the ESI access tokens it was holding", async () => {
    esiCredentials.adoptEsiAccessToken(CHARACTER_HASH, esiAccessToken());
    expect(esiCredentials.heldEsiAccessToken(CHARACTER_HASH)).not.toBe("");

    await signOut();

    expect(esiCredentials.heldEsiAccessToken(CHARACTER_HASH)).toBe("");
  });

  // The queue is dropped, not just left to find nobody signed in. A job delivered
  // over the socket waits a moment before it reaches the store, and that wait can
  // outlast the sign-out: the next reader to sign in on this tab would otherwise be
  // handed a job from the session before theirs.
  it("does not hand a job still in flight to the next session", async () => {
    enqueueInboundJobDocumentChange("upsert", "job-2", { jobStatus: 0 });

    await signOut();
    signedInWithAJob();
    await vi.advanceTimersByTimeAsync(COALESCE_FLUSH_MS * 2);

    expect(useUsersStore.getState().jobData.jobArray).toEqual([
      { jobID: "job-1" },
    ]);
  });

  // The socket goes first, so nothing can arrive over it while the session is being
  // taken apart, and each is done once rather than once per store reset.
  it("closes the socket before it tells the server", async () => {
    await signOut();

    expect(edges.steps).toEqual(["socket closed", "server told"]);
  });
});

describe("signing out when the server refuses", () => {
  beforeEach(() => {
    edges.logoutFails = true;
  });

  // Whatever made the logout fail must not survive into the next session, so the
  // teardown runs regardless and the tab is reloaded rather than routed.
  it("still tears the session down", async () => {
    await signOut().catch(() => {});

    const { account, jobData } = useUsersStore.getState();
    expect(account.isLoggedIn).toBe(false);
    expect(jobData.jobArray).toEqual([]);
    expect(queryClient.getQueryData(["jobs"])).toBeUndefined();
    expect(localStorage.getItem("Auth")).toBeNull();
  });
});

// `SameSite=Lax` sends the session cookie on a top-level GET, so arriving at
// `/signout` is all it takes — and anyone can make a reader arrive. The mark rides
// in history state, which a URL cannot carry.
describe("arriving at /signout without the app having sent you", () => {
  it("does not end the session", async () => {
    const { pathname } = await enterRoute("/signout");

    expect(pathname).toBe("/");
    expect(edges.steps).toEqual([]);

    const { account, jobData } = useUsersStore.getState();
    expect(account.isLoggedIn).toBe(true);
    expect(jobData.jobArray).toEqual([{ jobID: "job-1" }]);
    expect(queryClient.getQueryData(["jobs"])).toEqual(["job-1"]);
  });
});
