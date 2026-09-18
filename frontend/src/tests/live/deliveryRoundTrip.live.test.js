import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openClient, startWebsocketHarness } from "./crossClientHarness.js";

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
 * One client, because these are round trips rather than meetings: what a change
 * by one member looks like to another is
 * `crossClientDelivery.live.test.js`. The client is its own process either way —
 * the store is a module singleton, so a process is what "a client" means here.
 *
 * Needs a Go toolchain, no stack. Set EIP_WS_E2E=1 to run it.
 */

const RUN = process.env.EIP_WS_E2E === "1";
const ORIGIN = "http://localhost:3000";
const CORPORATION = 30;
const PLANNER = `corporation:${CORPORATION}`;
const READER = { accountID: "acct-round-trip", sessionID: "sess-round-trip" };

let harness;
let reader;

describe.skipIf(!RUN)("a save coming back as a delivery", () => {
  beforeAll(async () => {
    harness = await startWebsocketHarness({
      sessions: [{ ...READER, corporationID: CORPORATION }],
      origin: ORIGIN,
    });
    reader = await openClient({
      ...READER,
      planner: PLANNER,
      apiBase: harness.api,
      wsBase: harness.ws,
      origin: ORIGIN,
    });
  }, 180_000);

  afterAll(async () => {
    await reader?.close();
    await harness?.stop();
  });

  it("puts a saved job into the store through the server", async () => {
    await reader.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [{ jobID: "job-shared", name: "Shared build" }],
    );

    await reader.until(
      "jobData.jobArray",
      (jobs) => jobs?.some((job) => job.jobID === "job-shared"),
      "the store to hold the job the server delivered",
    );

    // Applied because the delivery carried a position, not because a stamp on
    // the document happened to compare well.
    const applied = await reader.read("websocketSync.positions");
    expect(applied["job_documents.job-shared"]).toBeGreaterThan(0);

    // A delete travels the same path and carries no document, so the position it
    // carries is the only thing ordering it against the writes around it.
    await reader.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "deleteJobDocumentsFromApi",
      ["job-shared"],
    );

    await reader.until(
      "jobData.jobArray",
      (jobs) => !jobs?.some((job) => job.jobID === "job-shared"),
      "the store to drop the job the server deleted",
    );

    const afterDelete = await reader.read("websocketSync.positions");
    expect(afterDelete["job_documents.job-shared"]).toBeGreaterThan(
      applied["job_documents.job-shared"],
    );
  }, 60_000);

  // The lock frames are the other contract crossing this seam, and the only one
  // where the two sides can disagree silently: the SPA names the planner on
  // every frame and the server refuses a frame that names none, so a mismatch
  // leaves both suites green while no lock is ever taken.
  it("takes a lock in the planner the SPA is working in", async () => {
    await reader.call(
      "/src/Functions/Endpoints/Private/documentLockClient.js",
      "pulseDocumentLockWaitlist",
      "job_documents",
      "job-locked",
    );

    const pulsedUnder = async (owner) => {
      const url = new URL(`${harness.api}/waitlist-pulse`);
      url.searchParams.set("owner", owner);
      url.searchParams.set("collection", "job_documents");
      url.searchParams.set("docID", "job-locked");
      url.searchParams.set("session", READER.sessionID);
      const res = await fetch(url.toString());
      return (await res.json()).present;
    };

    await expect
      .poll(() => pulsedUnder(PLANNER), { timeout: 10_000 })
      .toBe(true);
    // Not the account's own planner: the client names that only when no planner
    // is active, and this frame names one.
    expect(await pulsedUnder(`account:${READER.accountID}`)).toBe(false);
  }, 60_000);
});
