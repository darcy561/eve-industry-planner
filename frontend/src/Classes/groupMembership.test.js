import { describe, expect, it, vi } from "vitest";

vi.mock("../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { default: Group } = await import("./group.js");

function group(data) {
  return new Group({ groupID: "group-1", ...data });
}

// Job and group ids are strings the planner mints; type, material and linked
// ESI ids are numbers EVE issues. A set of one never matches a lookup for the
// other, which is what these methods are guarding.
describe("the jobs a group includes", () => {
  it("holds job ids as strings, however they arrive", () => {
    const g = group({ includedJobIDs: ["job-1", "job-2"] });

    g.addIncludedJobIDs("job-3");
    g.addIncludedJobIDs(["job-4", "job-5"]);
    g.addIncludedJobIDs(new Set(["job-6"]));

    expect(g.includedJobIDs).toEqual(
      new Set(["job-1", "job-2", "job-3", "job-4", "job-5", "job-6"]),
    );
  });

  it("replaces membership when set, and drops what it cannot read", () => {
    const g = group({ includedJobIDs: ["job-1"] });

    g.setIncludedJobIDs(["job-2", null, "job-3"]);

    expect(g.includedJobIDs).toEqual(new Set(["job-2", "job-3"]));
  });

  it("removes one id or several", () => {
    const g = group({ includedJobIDs: ["job-1", "job-2", "job-3"] });

    g.removeIncludedJobIDs("job-1");
    g.removeIncludedJobIDs(["job-2"]);

    expect(g.includedJobIDs).toEqual(new Set(["job-3"]));
  });

  it("adds nothing for nothing", () => {
    const g = group({ includedJobIDs: ["job-1"] });

    g.addIncludedJobIDs(null);
    g.addIncludedJobIDs([]);
    g.removeIncludedJobIDs(undefined);

    expect(g.includedJobIDs).toEqual(new Set(["job-1"]));
  });
});

describe("the type and material ids a group covers", () => {
  it("holds them as numbers, however they arrive", () => {
    const g = group({ includedTypeIDs: ["587"], materialIDs: [34] });

    g.addIncludedTypeIDs("588");
    g.addMaterialIDs(["35", 36]);

    expect(g.includedTypeIDs).toEqual(new Set([587, 588]));
    expect(g.materialIDs).toEqual(new Set([34, 35, 36]));
  });

  // The lookup is by number, so a type id stored as a string still answers.
  it("answers whether it includes a type, given either form", () => {
    const g = group({ includedTypeIDs: ["587"] });

    expect(g.hasIncludedTypeId(587)).toBe(true);
    expect(g.hasIncludedTypeId("587")).toBe(true);
    expect(g.hasIncludedTypeId(34)).toBe(false);
  });

  it("removes and replaces them", () => {
    const g = group({ includedTypeIDs: [587, 588], materialIDs: [34, 35] });

    g.removeIncludedTypeIDs(587);
    g.setMaterialIDs([36]);

    expect(g.includedTypeIDs).toEqual(new Set([588]));
    expect(g.materialIDs).toEqual(new Set([36]));
  });
});

describe("the ESI entries a group's jobs hold", () => {
  it("keeps runs, orders and transactions as numbers", () => {
    const g = group({});

    g.addLinkedJobIDs(["500000001", 500000002]);
    g.addLinkedOrderIDs("6440610546");
    g.addLinkedTransIDs([6440610547]);

    expect(g.linkedJobIDs).toEqual(new Set([500000001, 500000002]));
    expect(g.linkedOrderIDs).toEqual(new Set([6440610546]));
    expect(g.linkedTransIDs).toEqual(new Set([6440610547]));
  });

  it("releases them one at a time or together", () => {
    const g = group({ linkedJobIDs: [1, 2, 3] });

    g.removeLinkedJobIDs(1);
    g.removeLinkedJobIDs(new Set([2]));

    expect(g.linkedJobIDs).toEqual(new Set([3]));
  });
});

describe("which jobs a group counts as complete", () => {
  it("holds them as job ids and can be replaced", () => {
    const g = group({ areComplete: ["job-1"] });

    g.addAreComplete(["job-2"]);
    expect(g.areComplete).toEqual(new Set(["job-1", "job-2"]));

    g.setAreComplete("job-3");
    expect(g.areComplete).toEqual(new Set(["job-3"]));

    g.removeAreComplete("job-3");
    expect(g.areComplete).toEqual(new Set());
  });
});

describe("storing a group", () => {
  it("writes ids as arrays, with the numbered ones sorted", () => {
    const g = group({
      groupName: "Fuel blocks",
      includedJobIDs: ["job-2", "job-1"],
      includedTypeIDs: [588, 587],
      materialIDs: [35, 34],
      linkedJobIDs: [2, 1],
      areComplete: ["job-1"],
    });

    const document = g.toDocument();

    expect(document.includedTypeIDs).toEqual([587, 588]);
    expect(document.materialIDs).toEqual([34, 35]);
    expect(document.linkedJobIDs).toEqual([1, 2]);
    expect(new Group(document).toDocument()).toEqual(document);
  });

  // Sorting keeps an unchanged group from being written as modified.
  it("writes the same document for the same ids in a different order", () => {
    const first = group({ includedTypeIDs: [588, 587], materialIDs: [35, 34] });
    const second = group({
      includedTypeIDs: [587, 588],
      materialIDs: [34, 35],
    });

    expect(first.toDocument().includedTypeIDs).toEqual(
      second.toDocument().includedTypeIDs,
    );
    expect(first.toDocument().materialIDs).toEqual(
      second.toDocument().materialIDs,
    );
  });
});
