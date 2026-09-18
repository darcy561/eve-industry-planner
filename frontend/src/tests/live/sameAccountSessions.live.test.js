import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openClient, startWebsocketHarness } from "./crossClientHarness.js";

/**
 * Two sessions of one account — the case the lock controls are written for.
 *
 * A member on two machines is not two members: the server lets one session of an
 * account take a lock another of its sessions holds, and the copy offering that
 * says "another tab on your account". The server's own tests cover the fan-out
 * reaching both sessions; what they cannot show is the SPA making the request,
 * which is where the two cases are currently one boolean.
 *
 * Needs a Go toolchain, no stack. Set EIP_WS_E2E=1 to run it.
 */

const RUN = process.env.EIP_WS_E2E === "1";
const ORIGIN = "http://localhost:3000";
const CORPORATION = 50;
const PLANNER = `corporation:${CORPORATION}`;
const ACCOUNT = "acct-two-sessions";
const FIRST = { accountID: ACCOUNT, sessionID: "sess-two-sessions-first" };
const SECOND = { accountID: ACCOUNT, sessionID: "sess-two-sessions-second" };
const LOCK_CLIENT = "/src/Functions/Endpoints/Private/documentLockClient.js";
const DOC = ["job_documents", "job-two-sessions"];

let harness;
let first;
let second;

describe.skipIf(!RUN)("one account in two sessions", () => {
  beforeAll(async () => {
    harness = await startWebsocketHarness({
      sessions: [FIRST, SECOND].map((who) => ({
        ...who,
        corporationID: CORPORATION,
      })),
      origin: ORIGIN,
    });
    const open = (who) =>
      openClient({
        ...who,
        planner: PLANNER,
        apiBase: harness.api,
        wsBase: harness.ws,
        origin: ORIGIN,
      });
    [first, second] = await Promise.all([open(FIRST), open(SECOND)]);
  }, 180_000);

  afterAll(async () => {
    await Promise.all([first?.close(), second?.close()]);
    await harness?.stop();
  });

  it("holds the lock against the account's own other session", async () => {
    const taken = await first.call(LOCK_CLIENT, "acquireDocumentLock", ...DOC);
    expect(taken.status, `acquire said: ${taken.body}`).toBe(201);

    const refused = await second.call(
      LOCK_CLIENT,
      "acquireDocumentLock",
      ...DOC,
    );

    // Contended, not refused outright: the lock is held, and the answer says by
    // whom so the second session can decide what to offer its reader.
    expect(refused.status).toBe(200);
    expect(JSON.parse(refused.body)).toMatchObject({
      held: true,
      acquired: false,
      holderSessionID: FIRST.sessionID,
    });
  }, 60_000);

  // The control that exists for exactly this case. The same call against a lock
  // another *member* holds is answered as though no lock existed, which is what
  // the SPA cannot currently tell apart.
  it("lets the account's other session take the lock over", async () => {
    const cleared = await second.call(
      LOCK_CLIENT,
      "forceReleaseDocumentLockSameAccount",
      ...DOC,
    );

    expect(cleared.status, `force-release said: ${cleared.body}`).toBe(201);
    expect(JSON.parse(cleared.body)).toMatchObject({
      holderSessionID: SECOND.sessionID,
    });
  }, 60_000);
});
