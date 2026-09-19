import { describe, expect, it } from "vitest";

import { checkSkillEligibility } from "./useGroupScheduler";

// A job's required skills are keyed by type id, as the document stores them.
// The character's are keyed the same way, which is what lets the check read one
// against the other without walking either.
const requires = (levels) =>
  Object.fromEntries(
    Object.entries(levels).map(([typeID, level]) => [
      typeID,
      { typeID: Number(typeID), level },
    ]),
  );

const trained = (levels) =>
  Object.fromEntries(
    Object.entries(levels).map(([typeID, activeLevel]) => [
      typeID,
      { id: Number(typeID), activeLevel },
    ]),
  );

describe("checkSkillEligibility", () => {
  it("passes a character trained to the level the job asks for", () => {
    expect(
      checkSkillEligibility(requires({ 3380: 4 }), trained({ 3380: 4 })),
    ).toBe(true);
  });

  it("passes a character trained beyond it", () => {
    expect(
      checkSkillEligibility(requires({ 3380: 4 }), trained({ 3380: 5 })),
    ).toBe(true);
  });

  it("refuses a character short of the level", () => {
    expect(
      checkSkillEligibility(requires({ 3380: 4 }), trained({ 3380: 3 })),
    ).toBe(false);
  });

  it("refuses a character who has not trained the skill at all", () => {
    expect(checkSkillEligibility(requires({ 3380: 1 }), trained({}))).toBe(
      false,
    );
  });

  it("refuses when one of several skills is short", () => {
    expect(
      checkSkillEligibility(
        requires({ 3380: 3, 3395: 4 }),
        trained({ 3380: 5, 3395: 2 }),
      ),
    ).toBe(false);
  });

  // A job requiring nothing is runnable by anyone. Worth stating because the
  // check reached this answer through `requiredSkills.length === 0` when the
  // collection was an array: on the keyed shape that read `undefined === 0`,
  // which is false, so the guard stopped firing and the loop below it decided
  // the answer instead. It happens to agree here — and would not have, had the
  // guard been the only thing standing between a job and a character who could
  // not build it.
  it("passes a job that requires nothing", () => {
    expect(checkSkillEligibility({}, trained({ 3380: 5 }))).toBe(true);
  });

  it("passes a job whose skills are missing entirely", () => {
    expect(checkSkillEligibility(undefined, trained({ 3380: 5 }))).toBe(true);
  });
});
