import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { collection, industryJobs, characters } = vi.hoisted(() => ({
  collection: { current: null },
  industryJobs: { current: [] },
  characters: [{ CharacterHash: "character-hash-a", CharacterID: 2114000001 }],
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(state));
});

vi.mock("../../../../../../Hooks/EveEsi/useBlueprintIndex", () => ({
  default: () => ({
    data: collection.current,
    isLoading: false,
    error: null,
  }),
  BLUEPRINT_SCOPE: { ALL: "all" },
}));

vi.mock("../../../../../../Hooks/EveEsi/useGetAllIndustryJobs", () => ({
  default: () => ({
    data: industryJobs.current,
    isLoading: false,
    error: null,
  }),
}));

import { ReactionLayout_BlueprintOptions } from "./reactionLayout";
import buildBlueprintRows from "../../../../../../Functions/Blueprints/buildBlueprintRows";
import {
  blueprintSearchIndex,
  CHARACTER_HASH,
  CORPORATION_ID,
  POLYMER_REACTION_TYPE_ID,
  reactionFormulaStackRow,
} from "../../../../../../tests/blueprintFixtures";

const state = {
  activeJob: { blueprintTypeID: POLYMER_REACTION_TYPE_ID },
};

function corporationFormula(itemId) {
  return {
    ...reactionFormulaStackRow,
    item_id: itemId,
    quantity: -1,
    CharacterHash: undefined,
    is_corporation: true,
    corporation_id: CORPORATION_ID,
  };
}

function withRows(rows) {
  collection.current = buildBlueprintRows(rows, blueprintSearchIndex);
}

beforeEach(() => {
  characters[0].CharacterHash = CHARACTER_HASH;
  industryJobs.current = [];
  withRows([reactionFormulaStackRow]);
});

describe("the formulas a reaction job can be built from", () => {
  it("counts every formula in a stack, not the row", () => {
    render(<ReactionLayout_BlueprintOptions state={state} />);

    expect(reactionFormulaStackRow.quantity).toBe(4);
    expect(screen.getByText("Total: 4")).toBeTruthy();
  });

  it("groups a character's and a corporation's formulas apart", () => {
    withRows([reactionFormulaStackRow, corporationFormula(8500)]);

    render(<ReactionLayout_BlueprintOptions state={state} />);

    expect(screen.getAllByText(/^Total: /)).toHaveLength(2);
  });

  it("reports the formulas already carrying an active job", () => {
    industryJobs.current = [
      { blueprint_id: reactionFormulaStackRow.item_id, status: "active" },
      { blueprint_id: 999999, status: "active" },
      { blueprint_id: reactionFormulaStackRow.item_id, status: "delivered" },
    ];

    render(<ReactionLayout_BlueprintOptions state={state} />);

    expect(screen.getByText("In Use: 1")).toBeTruthy();
  });

  // The rows belong to React Query's cache. A panel that stamped an owner onto them, as this one
  // used to, mutates what every other consumer reads.
  it("does not write to the rows it renders", () => {
    const rows = [reactionFormulaStackRow];
    withRows(rows);
    const before = JSON.stringify(collection.current.rows);

    render(<ReactionLayout_BlueprintOptions state={state} />);

    expect(JSON.stringify(collection.current.rows)).toBe(before);
  });

  it("shows nothing when no formula of the type is held", () => {
    withRows([]);

    render(<ReactionLayout_BlueprintOptions state={state} />);

    expect(screen.queryByText(/^Total: /)).toBeNull();
  });
});
