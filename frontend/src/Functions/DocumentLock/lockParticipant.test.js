import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lockParticipantID } from "./lockParticipant.js";

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../testing/fixtures/document-lock/participant.json",
    ),
    "utf8",
  ),
);

describe("lockParticipantID", () => {
  it("derives the participant the server names a session by", () => {
    expect(lockParticipantID(fixture.sessionID)).toBe(fixture.participantID);
  });

  it("does not carry the session id it was made from", () => {
    const participant = lockParticipantID(fixture.sessionID);

    expect(participant).not.toContain(fixture.sessionID.slice(0, 8));
    expect(lockParticipantID(`${fixture.sessionID}x`)).not.toBe(participant);
  });

  it("names nobody for no session", () => {
    expect(lockParticipantID("")).toBe("");
    expect(lockParticipantID(null)).toBe("");
  });
});
