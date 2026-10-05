import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  openClient,
  startWebsocketHarness,
  jobWrite,
} from "./crossClientHarness.js";

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
      [jobWrite({ jobID: "job-shared", name: "Shared build" })],
    );

    await reader.until(
      "jobData.jobArray",
      (jobs) => jobs?.some((job) => job.jobID === "job-shared"),
      "the store to hold the job the server delivered",
    );

    const applied = await reader.read("websocketSync.positions");
    expect(applied["job_documents.job-shared"]).toBeGreaterThan(0);

    await reader.call(
      "/src/Functions/Job/changes/deleteMultipleJobs.js",
      "default",
      ["job-shared"],
    );

    await reader.until(
      "websocketSync.positions",
      (positions) =>
        positions?.["job_documents.job-shared"] >
        applied["job_documents.job-shared"],
      "the server's delete to be delivered",
    );

    const jobs = await reader.read("jobData.jobArray");
    expect(jobs.some((job) => job.jobID === "job-shared")).toBe(false);
  }, 60_000);

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

    expect(await pulsedUnder(`account:${READER.accountID}`)).toBe(false);
  }, 60_000);
});
