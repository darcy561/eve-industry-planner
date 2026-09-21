import { describe, expect, it, vi } from "vitest";

const cachedSkills = { data: {} };
/** Whose skills the last calculation read. */
const asked = { hash: null };
const reader = { own: ["hash-1"], main: "hash-main" };

vi.mock("../../Hooks/EveEsi/Character/useGetCharacterSkills", () => ({
  getCachedCharacterSkills: (_queryClient, characterHash) => {
    asked.hash = characterHash;
    return cachedSkills;
  },
}));
vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: {
        actions: {
          findCharacterByHash: (hash) =>
            reader.own.includes(hash) ? { CharacterHash: hash } : null,
          getMainCharacterHash: () => reader.main,
        },
      },
    }),
  },
}));
vi.mock("../Helper/getStructureInfo", () => ({
  getStructureInfoFromID: () => ({ time: 0 }),
  getRigInfoFromID: () => ({ time: 0 }),
}));

const { default: calculateTimeForSetup } =
  await import("./calculateTimeForSetup.js");
const { default: Setup } = await import("../../Classes/jobSetup.js");
const { jobTypes } = await import("../../Context/defaultValues.jsx");

const INDUSTRY = 3380;
const ADVANCED_INDUSTRY = 3388;
const REACTIONS = 45746;
const CAPITAL_CONSTRUCTION = 22242;
const A_JOB_SKILL = 3395;

const skill = (id, activeLevel) => [id, { id, activeLevel }];

function setup({
  jobType = jobTypes.manufacturing,
  rawTime = 1000,
  runCount = 1,
  TE = 0,
  selectedCharacter = "hash-1",
} = {}) {
  return new Setup({
    jobType,
    rawTime,
    runCount,
    TE,
    structureID: 0,
    rigID: 0,
    selectedCharacter,
  });
}

function withSkills(entries) {
  cachedSkills.data = Object.fromEntries(entries);
}

describe("calculateTimeForSetup", () => {
  // A setup carrying no raw time has no time to state. It is read as stored
  // data rather than as an instance, so what it is matters less than what it
  // holds.
  it("gives nothing back without the figures it multiplies", () => {
    expect(calculateTimeForSetup({}, {}, {})).toBeUndefined();
    expect(calculateTimeForSetup(setup(), null, {})).toBeUndefined();
    expect(calculateTimeForSetup(setup(), {}, null)).toBeUndefined();
  });

  it("is the raw time when nothing reduces it", () => {
    withSkills([]);

    expect(calculateTimeForSetup(setup(), {}, {})).toBe(1000);
  });

  it("multiplies by the number of runs", () => {
    withSkills([]);

    expect(calculateTimeForSetup(setup({ runCount: 7 }), {}, {})).toBe(7000);
  });

  it("applies the job type's own time modifier", () => {
    withSkills([skill(INDUSTRY, 5), skill(ADVANCED_INDUSTRY, 5)]);

    // 1000 × 0.8 × 0.85
    expect(calculateTimeForSetup(setup(), {}, {})).toBe(680);
  });

  it("uses the reaction modifier for a reaction", () => {
    withSkills([skill(REACTIONS, 5), skill(INDUSTRY, 5)]);

    // Reactions V alone: Industry does not enter a reaction's time.
    expect(
      calculateTimeForSetup(setup({ jobType: jobTypes.reaction }), {}, {}),
    ).toBe(800);
  });

  it("takes a further 1% off per level of each skill the job requires", () => {
    withSkills([skill(A_JOB_SKILL, 4)]);

    expect(
      calculateTimeForSetup(
        setup(),
        { [A_JOB_SKILL]: { typeID: A_JOB_SKILL } },
        {},
      ),
    ).toBe(960);
  });

  it("does not count a required skill the character has not trained", () => {
    withSkills([]);

    expect(
      calculateTimeForSetup(
        setup(),
        { [A_JOB_SKILL]: { typeID: A_JOB_SKILL } },
        {},
      ),
    ).toBe(1000);
  });

  it("does not count the industry skills twice", () => {
    // Industry, Advanced Industry, Reactions and Capital Ship Construction
    // already move the time through the job type's modifier, so listing one as a
    // requirement must not reduce it a second time.
    withSkills([
      skill(INDUSTRY, 5),
      skill(ADVANCED_INDUSTRY, 5),
      skill(CAPITAL_CONSTRUCTION, 5),
    ]);

    const requirements = {
      [INDUSTRY]: { typeID: INDUSTRY },
      [ADVANCED_INDUSTRY]: { typeID: ADVANCED_INDUSTRY },
      [CAPITAL_CONSTRUCTION]: { typeID: CAPITAL_CONSTRUCTION },
    };

    expect(calculateTimeForSetup(setup(), requirements, {})).toBe(
      calculateTimeForSetup(setup(), {}, {}),
    );
  });

  it("quotes the setup's own character when the reader has them", () => {
    withSkills([]);

    calculateTimeForSetup(setup(), {}, {});

    expect(asked.hash).toBe("hash-1");
  });

  // A setup on a shared planner names the member who planned it, and this
  // account holds no skills for them: reading that hash returns nothing and
  // quotes the job as though nobody had trained anything.
  it("quotes the reader's main when the setup names another member", () => {
    withSkills([]);

    calculateTimeForSetup(setup({ selectedCharacter: "hash-theirs" }), {}, {});

    expect(asked.hash).toBe("hash-main");
  });

  it("rounds down to a whole second", () => {
    withSkills([skill(A_JOB_SKILL, 1)]);

    // 1001 × 0.99 = 990.99
    expect(
      calculateTimeForSetup(
        setup({ rawTime: 1001 }),
        { [A_JOB_SKILL]: { typeID: A_JOB_SKILL } },
        {},
      ),
    ).toBe(990);
  });
});
