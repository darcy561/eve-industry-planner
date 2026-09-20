import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolve } from "node:path";

import { structureKinds } from "./defaultValues";

// The kinds a stored structure's jobType can be, checked against what the
// server means by the same field. Why this exists, and how to regenerate the
// fixture, are in services/shared/models/structure_kinds_parity_test.go.
const { kinds } = JSON.parse(
  fs.readFileSync(
    resolve(process.cwd(), "../testing/fixtures/structure-kinds/kinds.json"),
    "utf8",
  ),
);

describe("the kinds a structure can be", () => {
  // A kind either side knows about and the other does not is a row one of them
  // cannot read: the SPA would offer a kind the server drops, or the server
  // would hold rows the SPA never lists.
  it("is the set the server knows, no more and no less", () => {
    expect(Object.keys(structureKinds).sort()).toEqual(
      Object.keys(kinds).sort(),
    );
  });

  // The value is what a stored row carries. A kind whose number disagrees
  // misfiles every row of it — read back as another kind, with that kind's
  // fields — rather than failing anywhere a reader would notice.
  it("agrees with the server on what each kind is worth", () => {
    for (const [name, value] of Object.entries(kinds)) {
      expect(structureKinds[name], `${name} must match the server`).toBe(value);
    }
  });
});
