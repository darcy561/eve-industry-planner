import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A save leaving the SPA and coming back into it as a delivery, over a real
 * socket to the real websocket service.
 *
 * The seam this covers is the one every other test describes rather than
 * exercises. The Go tests assert what reaches the wire; the other vitest tests
 * assert what the store does with a message a mock handed it. Nothing joined the
 * two, and both realtime defects found while building the position — a delete
 * stamped with the browser's clock, and a restore swallowed by the coalescer —
 * lived exactly there.
 *
 * Everything above the two transports is the SPA's own: its persist path, its
 * header assembly, its socket client, its handlers, its store. Between them sits
 * the Go integration fixture, standing in for the api and the change stream.
 *
 * **One browser, not two.** A second reader would need a second store, and the
 * store is a module singleton: `vi.resetModules()` does not give the socket
 * client a private one, so every client in a process writes into the same store
 * and a second "browser" would assert against the first one's data. What two
 * readers see of each other is covered on the server instead, over real sockets,
 * by `integration_position_test.go`. Joining both halves needs a browser per
 * process.
 *
 * Needs a Go toolchain, no stack. Set EIP_WS_E2E=1 to run it.
 */

const RUN = process.env.EIP_WS_E2E === "1";
const SERVICES = path.resolve(__dirname, "../../../../services");

const ACCOUNT_A = "acct-two-browsers-a";
const ACCOUNT_B = "acct-two-browsers-b";
const ACCOUNT_C = "acct-two-browsers-outside";
const SESSION_A = "sess-two-browsers-a";
const SESSION_B = "sess-two-browsers-b";
const SESSION_C = "sess-two-browsers-outside";
const CORPORATION = 30;
const OTHER_CORPORATION = 31;
const PLANNER = `corporation:${CORPORATION}`;

let harness;
let wsBase;
let apiBase;

/** Starts the Go harness and waits for it to say where it is listening. */
function startHarness() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "go",
      [
        "test",
        "./websocket/server/",
        "-run",
        "TestHarnessServe",
        "-v",
        "-count=1",
      ],
      {
        cwd: SERVICES,
        env: {
          ...process.env,
          EIP_WS_HARNESS: "1",
          EIP_WS_HARNESS_SESSIONS: `${ACCOUNT_A}:${SESSION_A}:${CORPORATION},${ACCOUNT_B}:${SESSION_B}:${CORPORATION},${ACCOUNT_C}:${SESSION_C}:${OTHER_CORPORATION}`,
          EIP_WS_HARNESS_TTL: "180",
          // jsdom sends this document's origin, and the server checks it.
          EIP_WS_HARNESS_ORIGINS: window.location.origin,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`harness did not start:\n${out}`)),
      60_000,
    );
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      const ws = out.match(/HARNESS_WS (\S+)/);
      const api = out.match(/HARNESS_API (\S+)/);
      if (ws && api) {
        clearTimeout(timer);
        resolve({ child, ws: ws[1], api: api[1] });
      }
    });
    child.stderr.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`harness exited (${code}):\n${out}`));
    });
  });
}

/**
 * Loads the SPA afresh — a second browser, not a second tab: its own module
 * registry, so its own store singleton and its own socket.
 */
async function openBrowser({ accountID, sessionID, planner = PLANNER }) {
  vi.resetModules();
  sessionStorage.setItem("eip_tab_session_id", sessionID);

  const store = (await import("../../Zustand/usersStore.js")).default;
  store.setState((state) => ({
    ...state,
    account: { ...state.account, accountID, isLoggedIn: true },
  }));

  const client = await import("../../WebSocket/websocketClient.js");
  client.connectWebsocket({ accountId: accountID });
  // Named once the socket is open, because the message goes over it: a planner
  // named before then is dropped, and the store keeps none — which leaves every
  // scoped read and every lock frame naming the account instead.
  await until(() => client.isWebsocketOpen(), "the socket to open");
  if (!client.sendActivePlanner(planner)) {
    throw new Error(`the socket did not take the planner ${planner}`);
  }
  return { store, client, sessionID };
}

/** Waits for something the SPA does asynchronously, without a fixed sleep. */
async function until(predicate, what, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe.skipIf(!RUN)("a save coming back as a delivery", () => {
  beforeAll(async () => {
    const started = await startHarness();
    harness = started.child;
    wsBase = started.ws;
    apiBase = started.api;

    // Both transports point at the harness; everything above them is the SPA's.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      return realFetch(
        url.startsWith("/") || url.startsWith(window.location.origin)
          ? apiBase + new URL(url, window.location.origin).pathname
          : url,
        init,
      );
    };
    const RealWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends RealWebSocket {
      constructor(url, protocols) {
        const target = new URL(String(url));
        const to = new URL(wsBase.replace(/^http/, "ws"));
        target.protocol = to.protocol;
        target.host = to.host;
        super(target.toString(), protocols);
      }
    };
  }, 90_000);

  afterAll(async () => {
    if (apiBase) {
      await fetch(`${apiBase}/shutdown`, { method: "POST" }).catch(() => {});
    }
    harness?.kill();
  });

  it("puts a saved job into the store through the server", async () => {
    const reader = await openBrowser({
      accountID: ACCOUNT_A,
      sessionID: SESSION_A,
    });

    const { putJobDocumentsBatch } =
      await import("../../Functions/Endpoints/Private/jobDocuments.js");
    await putJobDocumentsBatch([{ jobID: "job-shared", name: "Shared build" }]);

    await until(
      () =>
        reader.store
          .getState()
          .jobData.jobArray.some((job) => job.jobID === "job-shared"),
      "the store to hold the job the server delivered",
    );

    // Applied because the delivery carried a position, not because a stamp on the
    // document happened to compare well.
    const position =
      reader.store.getState().websocketSync.positions[
        "job_documents.job-shared"
      ];
    expect(position).toBeGreaterThan(0);

    // A delete travels the same path and carries no document, so the position it
    // carries is the only thing ordering it against the writes around it.
    const { deleteJobDocumentsFromApi } =
      await import("../../Functions/Endpoints/Private/jobDocuments.js");
    await deleteJobDocumentsFromApi(["job-shared"]);

    await until(
      () =>
        !reader.store
          .getState()
          .jobData.jobArray.some((job) => job.jobID === "job-shared"),
      "the store to drop the job the server deleted",
    );
    expect(
      reader.store.getState().websocketSync.positions[
        "job_documents.job-shared"
      ],
    ).toBeGreaterThan(position);
  }, 60_000);

  // The lock frames are the other contract crossing this seam, and the only one
  // where the two sides can disagree silently: the SPA names the planner on
  // every frame and the server refuses a frame that names none, so a mismatch
  // leaves both suites green while no lock is ever taken.
  it("takes a lock in the planner the SPA is working in", async () => {
    await openBrowser({ accountID: ACCOUNT_B, sessionID: SESSION_B });

    const { pulseDocumentLockWaitlist } =
      await import("../../Functions/Endpoints/Private/documentLockClient.js");
    pulseDocumentLockWaitlist("job_documents", "job-locked");

    const pulsedUnder = async (owner) => {
      const url = new URL(`${apiBase}/waitlist-pulse`);
      url.searchParams.set("owner", owner);
      url.searchParams.set("collection", "job_documents");
      url.searchParams.set("docID", "job-locked");
      url.searchParams.set("session", SESSION_B);
      const res = await fetch(url.toString());
      return (await res.json()).present;
    };

    await until(
      async () => await pulsedUnder(PLANNER),
      "the pulse to reach the planner's key",
    );
    // Not the account's own planner: the client names that only when no planner
    // is active, and this frame names one.
    expect(await pulsedUnder(`account:${ACCOUNT_B}`)).toBe(false);
  }, 60_000);
});
