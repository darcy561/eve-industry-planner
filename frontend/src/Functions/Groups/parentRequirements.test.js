import { jobMaking } from "../../tests/editJobFixtures";
import { describe, expect, it } from "vitest";

import {
  parentCommitment,
  resolveParentRequirements,
} from "./parentRequirements";

const parent = (quantity, childJobIDs = ["self"]) => ({
  build: {
    materials: { [String(34)]: { typeID: 34, quantity } },
    childJobs: { 34: childJobIDs },
  },
});

const walk = (jobs, parentJobIDs) =>
  resolveParentRequirements({
    parentJobIDs,
    findJobInJobArray: (id) => jobs[id],
    itemID: 34,
    jobID: "self",
  });

describe("resolveParentRequirements", () => {
  it("totals what every parent asks for", () => {
    const jobs = { p1: parent(100), p2: parent(250) };

    expect(walk(jobs, ["p1", "p2"])).toMatchObject({
      parentTotal: 350,
      childrenTotal: 0,
      multipleChildren: false,
      siblings: [],
    });
  });

  it("counts what siblings already produce, and not itself", () => {
    const jobs = {
      p1: parent(100, ["self", "sibling"]),
      sibling: jobMaking(40),
    };

    expect(walk(jobs, ["p1"])).toMatchObject({
      parentTotal: 100,
      childrenTotal: 40,
      multipleChildren: true,
      siblings: [{ jobID: "sibling", produced: 40 }],
    });
  });

  // A parent that has been deleted, or one that no longer uses this material,
  // asks for nothing rather than throwing on the way past.
  it("passes over a parent it cannot read", () => {
    const jobs = { p1: { build: { materials: {}, childJobs: {} } } };

    expect(walk(jobs, ["p1", "missing"])).toMatchObject({
      parentTotal: 0,
      childrenTotal: 0,
      multipleChildren: false,
    });
  });
});

describe("parentCommitment", () => {
  it("leaves a job with no parents free to sell everything", () => {
    expect(
      parentCommitment({ produced: 100, jobID: "self", hasParents: false }),
    ).toEqual({
      hasParents: false,
      outstanding: 0,
      committed: 0,
      surplus: 100,
      needed: 0,
      madeByOthers: 0,
      shortfall: 0,
      parents: [],
    });
  });

  it("commits the whole output when the parents need all of it", () => {
    const got = parentCommitment({
      produced: 100,
      jobID: "self",
      hasParents: true,
      requirements: { parentTotal: 100, siblings: [] },
    });

    expect(got.committed).toBe(100);
    expect(got.surplus).toBe(0);
  });

  // The honest edge case: a job making more than its parents need has something
  // it can actually sell.
  it("leaves the overproduction sellable", () => {
    const got = parentCommitment({
      produced: 150,
      jobID: "self",
      hasParents: true,
      requirements: { parentTotal: 100, siblings: [] },
    });

    expect(got.committed).toBe(100);
    expect(got.surplus).toBe(50);
  });

  // Where two children feed one parent, the second only owes what the first
  // does not cover — charging it the whole requirement would report no surplus.
  it("subtracts what siblings already cover", () => {
    const got = parentCommitment({
      produced: 100,
      jobID: "b-self",
      hasParents: true,
      requirements: {
        parentTotal: 100,
        siblings: [{ jobID: "a-first", produced: 70 }],
      },
    });

    expect(got.outstanding).toBe(30);
    expect(got.committed).toBe(30);
    expect(got.surplus).toBe(70);
  });

  it("owes nothing when siblings already cover the requirement", () => {
    const got = parentCommitment({
      produced: 100,
      jobID: "b-self",
      hasParents: true,
      requirements: {
        parentTotal: 100,
        siblings: [{ jobID: "a-first", produced: 200 }],
      },
    });

    expect(got.outstanding).toBe(0);
    expect(got.surplus).toBe(100);
  });

  it("cannot commit more than it makes", () => {
    const got = parentCommitment({
      produced: 40,
      jobID: "self",
      hasParents: true,
      requirements: { parentTotal: 100, siblings: [] },
    });

    expect(got.committed).toBe(40);
    expect(got.surplus).toBe(0);
  });
});

// Two children feeding one parent must not both count the other's whole output
// as covering the requirement, or each finds itself spare and the pair reports
// twice the stock the group actually has.
describe("two children sharing one requirement", () => {
  const requirement = 100;
  const a = { jobID: "a", produced: 60 };
  const b = { jobID: "b", produced: 50 };

  const viewOf = (self, other) =>
    parentCommitment({
      produced: self.produced,
      jobID: self.jobID,
      hasParents: true,
      requirements: { parentTotal: requirement, siblings: [other] },
    });

  it("shares the requirement out rather than giving each the whole of it", () => {
    const fromA = viewOf(a, b);
    const fromB = viewOf(b, a);

    expect(fromA.committed + fromB.committed).toBe(requirement);
    // 110 made against 100 needed leaves 10 spare, once, not 10 each.
    expect(fromA.surplus + fromB.surplus).toBe(10);
  });

  it("gives both children the same answer about each other", () => {
    expect(viewOf(a, b).committed).toBe(60);
    expect(viewOf(b, a).committed).toBe(40);
  });

  // Neither child knows which units the parent will actually take, so the split
  // is arbitrary — but it has to be the same split whichever child asks.
  it("does not depend on which child is asking", () => {
    const first = viewOf(a, b);
    const second = viewOf(a, b);

    expect(first).toEqual(second);
  });
});

describe("what each parent is given", () => {
  const named = (jobID, quantity) => ({
    ...parent(quantity),
    jobID,
    name: jobID,
    itemID: 1,
  });
  const coverageFor = (jobs, produced) =>
    parentCommitment({
      produced,
      jobID: "self",
      hasParents: true,
      requirements: walk(jobs, Object.keys(jobs)),
    });

  it("names every parent with what it asks for, largest first", () => {
    const { parents } = coverageFor(
      { small: named("small", 20), large: named("large", 80) },
      100,
    );

    expect(
      parents.map(({ jobID, needs, short }) => [jobID, needs, short]),
    ).toEqual([
      ["large", 80, 0],
      ["small", 20, 0],
    ]);
  });

  it("leaves the smallest asks short when the job makes too little", () => {
    const { parents, shortfall } = coverageFor(
      { small: named("small", 20), large: named("large", 80) },
      90,
    );

    expect(shortfall).toBe(10);
    expect(parents.map(({ short }) => short)).toEqual([0, 10]);
  });

  it("counts a sibling's output towards the parents it feeds", () => {
    const jobs = {
      only: {
        ...named("only", 100),
        build: parent(100, ["self", "sibling"]).build,
      },
      sibling: jobMaking(60),
    };
    const { parents, shortfall } = parentCommitment({
      produced: 30,
      jobID: "self",
      hasParents: true,
      requirements: walk(jobs, ["only"]),
    });

    expect(shortfall).toBe(10);
    expect(parents[0].short).toBe(10);
  });

  it.each([
    ["sorts before this job", "a-sibling"],
    ["sorts after this job", "z-sibling"],
  ])(
    "states the same shortfall on the rows and for the job when a sibling %s",
    (_order, siblingID) => {
      const jobs = {
        only: {
          ...named("only", 100),
          build: parent(100, ["self", siblingID]).build,
        },
        [siblingID]: jobMaking(30),
      };
      const commitment = parentCommitment({
        produced: 50,
        jobID: "self",
        hasParents: true,
        requirements: walk(jobs, ["only"]),
      });

      expect(commitment.shortfall).toBe(20);
      expect(commitment.parents[0].short).toBe(20);
      expect(commitment).toMatchObject({ needed: 100, madeByOthers: 30 });
    },
  );
});
