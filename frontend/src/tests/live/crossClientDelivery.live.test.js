import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockParticipantID } from "../../Functions/DocumentLock/lockParticipant.js";
import {
  openClient,
  startWebsocketHarness,
  jobWrite,
} from "./crossClientHarness.js";

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
      [jobWrite({ jobID: "job-from-alice", name: "Alice's build" })],
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

  it("has the other member agree about a deleted group without writing", async () => {
    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [
        jobWrite({
          jobID: "job-in-group",
          name: "Grouped build",
          groupID: "group-gone",
        }),
      ],
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

  it("does not let a member resurrect a job somebody else deleted", async () => {
    await alice.call(
      "/src/Functions/Endpoints/Private/jobDocuments.js",
      "putJobDocumentsBatch",
      [jobWrite({ jobID: "job-doomed", name: "Doomed build" })],
    );
    await bob.until(
      "jobData.jobArray",
      (jobs) => jobs?.some((job) => job.jobID === "job-doomed"),
      "Bob's store to hold the job",
    );

    const held = (await bob.read("jobData.jobArray")).find(
      (job) => job.jobID === "job-doomed",
    );
    await bob.action("editSession", "openJob", "job-doomed", held);
    expect(await bob.read("editSession.activeJobID")).toBe("job-doomed");

    await alice.call(
      "/src/Functions/Job/changes/deleteMultipleJobs.js",
      "default",
      ["job-doomed"],
    );
    await bob.until(
      "jobData.jobArray",
      (jobs) => !jobs?.some((job) => job.jobID === "job-doomed"),
      "Bob's store to drop the deleted job",
    );

    await bob.forgetRequests();
    await bob.call(
      "/src/Functions/Job/editing/closeActiveJob.js",
      "closeActiveJob",
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
    expect(await bob.read("editSession.activeJobID")).toBeNull();
  }, 60_000);

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

    const contended = await bob.call(
      LOCK_CLIENT,
      "acquireDocumentLock",
      ...DOC,
    );

    expect(contended.status).toBe(200);
    expect(JSON.parse(contended.body)).toMatchObject({
      held: true,
      acquired: false,
      holderParticipantID: lockParticipantID(ALICE.sessionID),
    });
  }, 60_000);
});
