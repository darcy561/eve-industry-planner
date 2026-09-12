import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolve } from "node:path";

// The keys this SPA reads off a planner session response, checked against what
// the server can actually send. Why this exists, and how to regenerate the
// surface, are in services/api/v1endpoints/session_response_surface_test.go.
const surface = JSON.parse(
  fs.readFileSync(
    resolve(
      process.cwd(),
      "../testing/fixtures/session-responses/surface.json",
    ),
    "utf8",
  ),
);

const BOOTSTRAP = new Set(surface.types.SessionBootstrapResponse);
const ROTATE = new Set(surface.types.SessionRotateResponse);

/**
 * What `persistTabPlannerSessionFromAuthResponse` reads off any auth response.
 * Listed rather than derived: the reader destructures nothing, so there is no
 * shape to reflect over, and naming them here is what makes a new read visible.
 */
const PERSISTED = ["session_id", "refresh_token", "reauth_required_at"];

/** Read by the login and bootstrap paths only. */
const BOOTSTRAP_ONLY = [
  "esi_oauth_storage",
  "first_login",
  "main_character_hash",
  "user_document",
  "application_settings",
  "linked_characters",
];

describe("what the SPA reads off a session response", () => {
  it.each(PERSISTED)("%s is sent by a rotate", (key) => {
    expect(ROTATE.has(key)).toBe(true);
  });

  it.each([...PERSISTED, ...BOOTSTRAP_ONLY])(
    "%s is sent by a login or bootstrap",
    (key) => {
      expect(BOOTSTRAP.has(key)).toBe(true);
    },
  );

  // A rotate keeps a live session alive, so the deadline has to arrive on one:
  // a reauth window that only came with a fresh login could never be extended,
  // and every session would expire at its first deadline.
  it("carries the reauth deadline on both", () => {
    expect(ROTATE.has("reauth_required_at")).toBe(true);
    expect(BOOTSTRAP.has("reauth_required_at")).toBe(true);
  });

  // The generator is the only thing that writes this file, so a surface with no
  // paths means it ran against something that emits nothing — which would make
  // every assertion above pass for the wrong reason.
  it("was generated from real types", () => {
    expect(ROTATE.size).toBeGreaterThan(3);
    expect(BOOTSTRAP.size).toBeGreaterThan(ROTATE.size);
  });
});
