import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openClient, startWebsocketHarness } from "./crossClientHarness.js";

/**
 * What two members of one planner see of each other.
 *
 * Every other test in this tree is one client: the Go tests assert what reaches
 * the wire, the vitest tests assert what a store does with a message handed to
 * it, and the single-browser round trip joins those two for one client. None of
 * them can show a change made by one member arriving at another, which is the
 * thing a shared planner is for.
 *
 * Needs a Go toolchain, no stack. Set EIP_WS_E2E=1 to run it.
 */

const RUN = process.env.EIP_WS_E2E === "1";

const CORPORATION = 40;
const PLANNER = `corporation:${CORPORATION}`;
const ALICE = { accountID: "acct-cross-alice", sessionID: "sess-cross-alice" };
const BOB = { accountID: "acct-cross-bob", sessionID: "sess-cross-bob" };

let harness;
let alice;
let bob;

describe.skipIf(!RUN)("two members of one planner", () => {
  beforeAll(async () => {
    harness = await startWebsocketHarness({
      sessions: [ALICE, BOB].map((who) => ({
        ...who,
        corporationID: CORPORATION,
      })),
      origin: "http://localhost:3000",
    });
    const open = (who) =>
      openClient({
        ...who,
        planner: PLANNER,
        apiBase: harness.api,
        wsBase: harness.ws,
        origin: "http://localhost:3000",
      });
    [alice, bob] = await Promise.all([open(ALICE), open(BOB)]);
  }, 180_000);

  afterAll(async () => {
    await Promise.all([alice?.close(), bob?.close()]);
    await harness?.stop();
  });

  it("puts a job one member saves into the other's store", async () => {
    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [{ jobID: "job-from-alice", name: "Alice's build" }],
    );

    await bob.until(
      "jobData.jobArray",
      (jobs) => jobs?.some((job) => job.jobID === "job-from-alice"),
      "Bob's store to hold the job Alice saved",
    );

    const held = await bob.read("jobData.jobArray");
    expect(held.find((job) => job.jobID === "job-from-alice")?.name).toBe(
      "Alice's build",
    );
  }, 60_000);

  // Each client applies what it is told, and says how far it has applied. The
  // position is the delivery's, so both members record the same one for the same
  // change rather than each stamping its own clock on it.
  it("has both members record the same place in the stream", async () => {
    const key = "websocketSync.positions";
    await alice.until(
      key,
      (positions) => positions?.["job_documents.job-from-alice"] > 0,
      "Alice to record the delivery's position",
    );
    const [seenByAlice, seenByBob] = await Promise.all([
      alice.read(key),
      bob.read(key),
    ]);

    expect(seenByBob["job_documents.job-from-alice"]).toBe(
      seenByAlice["job_documents.job-from-alice"],
    );
  }, 60_000);

  // A client that cannot start must say why. The harness spawns a process and
  // waits for it to report ready, so a failure inside it is invisible unless the
  // exit carries what the child wrote — without that this is a timeout with no
  // cause attached, which is the hardest kind of test failure to act on.
  it("fails with the client's own error when it cannot start", async () => {
    await expect(
      openClient({
        accountID: "acct-cross-unseeded",
        sessionID: "sess-cross-unseeded",
        planner: PLANNER,
        apiBase: harness.api,
        wsBase: harness.ws,
        origin: "http://localhost:3000",
      }),
    ).rejects.toThrow(/timed out waiting for the socket to open/);
  }, 120_000);

  // One member deletes a group; the other must end up agreeing without writing.
  //
  // Alice deletes through the path a reader's click takes, so her client checks
  // the lock, removes the group, releases its jobs and saves them. Bob is told,
  // and what he must not do is save his own copies of the same jobs — that is
  // the same write once per connected member, each from whatever snapshot it
  // held, and no single client can see it happening.
  it("has the other member agree about a deleted group without writing", async () => {
    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [{ jobID: "job-in-group", name: "Grouped build", groupID: "group-gone" }],
    );
    for (const member of [alice, bob]) {
      await member.until(
        "jobData.jobArray",
        (jobs) => jobs?.some((job) => job.jobID === "job-in-group"),
        "the grouped job to arrive",
      );
      await member.action("jobData", "replaceGroupArray", [
        { groupID: "group-gone", includedJobIDs: ["job-in-group"] },
      ]);
    }
    await bob.forgetRequests();

    await alice.call(
      "/src/Functions/Groups/deleteGroupWithoutJobs.js",
      "deleteGroupWithoutJobs",
      "group-gone",
    );

    await bob.until(
      "jobData.jobArray",
      (jobs) =>
        jobs?.find((job) => job.jobID === "job-in-group")?.groupID === "",
      "Bob's copy of the job to be released onto the planner",
    );
    await bob.until(
      "jobData.groupArray",
      (groups) => !groups?.some((group) => group.groupID === "group-gone"),
      "Bob to drop the group",
    );

    const wroteAnything = (await bob.requests()).filter(
      (request) => request.method !== "GET",
    );
    expect(wroteAnything).toEqual([]);
  }, 120_000);

  // A job deleted while another member has it open must not come back.
  //
  // The editor keeps its own copy from the moment it opened, so the member
  // holding it can still press save on a document nobody else has any more.
  // Nothing about the store being correct stops that — the close path has to
  // refuse, and only two clients can show it refusing.
  it("does not let a member resurrect a job somebody else deleted", async () => {
    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [{ jobID: "job-doomed", name: "Doomed build" }],
    );
    await bob.until(
      "jobData.jobArray",
      (jobs) => jobs?.some((job) => job.jobID === "job-doomed"),
      "Bob's store to hold the job",
    );

    // Bob is working in it, holding his own copy as the editor does.
    const held = (await bob.read("jobData.jobArray")).find(
      (job) => job.jobID === "job-doomed",
    );
    await bob.action("jobData", "setActiveJobID", "job-doomed");

    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "deleteJobDocumentsFromApi",
      ["job-doomed"],
    );
    await bob.until(
      "jobData.jobArray",
      (jobs) => !jobs?.some((job) => job.jobID === "job-doomed"),
      "Bob's store to drop the deleted job",
    );

    await bob.forgetRequests();
    await bob.call(
      "/src/Functions/JobPlanner/closeActiveJob.js",
      "default",
      held,
      true,
      {},
      {},
      {},
      null,
    );

    expect(
      (await bob.requests()).filter((request) => request.method !== "GET"),
    ).toEqual([]);
    expect(await bob.read("jobData.activeJobID")).toBeNull();
  }, 60_000);

  // A member cannot clear a lock another member holds, and must be told so.
  //
  // The two halves of this are proven separately — the server refuses, and the
  // client has a message for the refusal — but only over the wire does the
  // refusal a browser actually receives get checked against the one the server
  // sends. It used to answer as though no lock existed at all.
  it("refuses to let one member clear another's lock", async () => {
    const LOCK_CLIENT =
      "/src/Functions/Endpoints/Private/documentLockClient.js";
    const DOC = ["job_documents", "job-contended"];

    const taken = await alice.call(LOCK_CLIENT, "acquireDocumentLock", ...DOC);
    expect(taken.status, `acquire said: ${taken.body}`).toBe(201);

    const refused = await bob.call(
      LOCK_CLIENT,
      "forceReleaseDocumentLockSameAccount",
      ...DOC,
    );

    expect(refused.status, `force-release said: ${refused.body}`).toBe(409);

    // And it is still Alice's: a refused clear must not have moved the lock.
    // Asked as Bob rather than as Alice, because Alice re-acquiring answers the
    // same way whether the lock was always hers or had been cleared to nobody.
    const contended = await bob.call(
      LOCK_CLIENT,
      "acquireDocumentLock",
      ...DOC,
    );

    expect(contended.status).toBe(200);
    expect(JSON.parse(contended.body)).toMatchObject({
      held: true,
      acquired: false,
      holderSessionID: ALICE.sessionID,
    });
  }, 60_000);
});
