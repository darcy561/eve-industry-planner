import { beforeEach, describe, expect, it, vi } from "vitest";

const { collection, account, applicationSettings } = vi.hoisted(() => ({
  collection: { current: null },
  account: { isLoggedIn: true },
  applicationSettings: { defaultMaterialEfficiencyValue: 0 },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account, applicationSettings }),
  );
});

vi.mock("../../Hooks/EveEsi/useBlueprintIndex", () => ({
  BLUEPRINT_SCOPE: { ALL: "all" },
  getCachedBlueprintIndex: () => collection.current,
}));

import {
  calculateSetupQuantitiesAcrossOwnedBlueprintOriginals,
  findHighestMaterialEfficiencyBlueprint,
} from "./setupHelpers";
import buildBlueprintRows from "../Blueprints/buildBlueprintRows";
import { jobTypes } from "../../Context/defaultValues";
import {
  blueprintSearchIndex,
  CAPACITOR_BLUEPRINT_TYPE_ID,
  characterBlueprintRows,
  POLYMER_REACTION_TYPE_ID,
  reactionFormulaStackRow,
  RIFTER_BLUEPRINT_TYPE_ID,
} from "../../tests/blueprintFixtures";

function withBlueprints(rows) {
  collection.current = buildBlueprintRows(rows, blueprintSearchIndex);
}

beforeEach(() => {
  account.isLoggedIn = true;
  applicationSettings.defaultMaterialEfficiencyValue = 0;
  withBlueprints([...characterBlueprintRows, reactionFormulaStackRow]);
});

describe("the blueprint a job is set up from", () => {
  it("takes the best researched original of its type", () => {
    const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
      jobTypes.manufacturing,
      RIFTER_BLUEPRINT_TYPE_ID,
      null,
    );

    // 7002 is the ME 10 / TE 20 original; TE is halved into the job's own scale.
    expect(ME).toBe(10);
    expect(TE).toBe(10);
  });

  it("falls back to the job type's default when the type is not held", () => {
    const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
      jobTypes.manufacturing,
      999999999,
      null,
    );

    expect(TE).toBe(0);
    expect(typeof ME).toBe("number");
  });

  it("does not read blueprints for a reaction", () => {
    const { TE } = findHighestMaterialEfficiencyBlueprint(
      jobTypes.reaction,
      POLYMER_REACTION_TYPE_ID,
      null,
    );

    expect(TE).toBe(0);
  });

  it("falls back when signed out", () => {
    account.isLoggedIn = false;

    const { TE } = findHighestMaterialEfficiencyBlueprint(
      jobTypes.manufacturing,
      RIFTER_BLUEPRINT_TYPE_ID,
      null,
    );

    expect(TE).toBe(0);
  });
});

describe("spreading runs across the originals a job can use", () => {
  // A stack of originals is one row carrying several, and each can hold its own job. Counting rows
  // gave one slot where the stack offers as many as it holds — and a reaction formula restacks
  // after every use, so a stack is its ordinary condition rather than an edge case.
  it("uses every original in a stack, not just the row", () => {
    withBlueprints([reactionFormulaStackRow]);

    const segments = calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
      POLYMER_REACTION_TYPE_ID,
      1000,
      40,
      1,
      null,
    );

    const slots = segments.reduce((total, s) => total + s.jobCount, 0);
    expect(reactionFormulaStackRow.quantity).toBe(4);
    expect(slots).toBe(4);
  });

  it("uses one slot when only one original is held", () => {
    const [single] = characterBlueprintRows.filter(
      (row) => row.type_id === RIFTER_BLUEPRINT_TYPE_ID && row.quantity === -1,
    );
    withBlueprints([single]);

    const segments = calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
      RIFTER_BLUEPRINT_TYPE_ID,
      1000,
      40,
      1,
      null,
    );

    expect(segments.reduce((total, s) => total + s.jobCount, 0)).toBe(1);
  });

  it("does not count copies as originals", () => {
    const copies = characterBlueprintRows.filter((row) => row.quantity === -2);
    withBlueprints(copies);

    const segments = calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
      RIFTER_BLUEPRINT_TYPE_ID,
      1000,
      40,
      1,
      null,
    );

    expect(segments.reduce((total, s) => total + s.jobCount, 0)).toBe(1);
  });

  it("counts a market stack of manufacturing originals too", () => {
    withBlueprints(characterBlueprintRows);

    const segments = calculateSetupQuantitiesAcrossOwnedBlueprintOriginals(
      CAPACITOR_BLUEPRINT_TYPE_ID,
      1000,
      40,
      1,
      null,
    );

    expect(segments.reduce((total, s) => total + s.jobCount, 0)).toBe(5);
  });
});
