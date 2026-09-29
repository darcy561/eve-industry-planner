import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolve } from "node:path";

import Setup from "./jobSetup";

// The fields a stored setup carries, checked against what the server declares.
// Why this exists, and how to regenerate the fixture, are in
// services/shared/models/job_setup_fields_parity_test.go.
const { always, optional } = JSON.parse(
  fs.readFileSync(
    resolve(process.cwd(), "../testing/fixtures/job-setup-fields/fields.json"),
    "utf8",
  ),
);

function documentKeys(setup) {
  return Object.keys(setup.toDocument()).sort();
}

describe("the fields a saved setup carries", () => {
  // A key the SPA writes and the server does not declare is refused by name
  // when the write is resolved, and the whole job write is dropped — the reader
  // sees a saved job that never reached the database.
  it("writes nothing the server has no field for", () => {
    const declared = new Set([...always, ...optional]);
    const written = documentKeys(
      new Setup({ enlistedFaction: 500011, militiaUpgradeLevel: 3 }),
    );

    expect(written.filter((key) => !declared.has(key))).toEqual([]);
  });

  // A field the server always expects and the SPA never writes is one the
  // server reads at its zero value for every setup this app creates.
  it("writes every field the server does not mark optional", () => {
    const written = new Set(documentKeys(new Setup({})));

    expect(always.filter((key) => !written.has(key))).toEqual([]);
  });

  // The optional fields are the ones the server omits when they are absent, so
  // the SPA leaves them out rather than writing an empty stand-in.
  it("leaves an optional field out when the setup has none", () => {
    expect(documentKeys(new Setup({}))).toEqual(
      expect.not.arrayContaining(optional),
    );
  });
});
