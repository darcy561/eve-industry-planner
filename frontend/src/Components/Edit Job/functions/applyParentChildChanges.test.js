import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { default: applyParentChildChanges } =
  await import("./applyParentChildChanges.js");
const { jobFromDocument } =
  await import("../../../Functions/JobDocuments/jobDocument.js");

const TRITANIUM = 34;

function editedJob() {
  return jobFromDocument({
    jobID: "edited",
    itemID: 587,
    parentJobs: [],
    build: {
      materials: { [TRITANIUM]: { typeID: TRITANIUM, name: "Tritanium" } },
      childJobs: { [TRITANIUM]: [] },
    },
  });
}

function otherJob(jobID, itemID = 587, childJobs = {}) {
  return jobFromDocument({
    jobID,
    itemID,
    parentJobs: [],
    build: { childJobs },
  });
}

const noChanges = (over = {}) => ({
  parentJobs: { add: [], remove: [] },
  childJobs: {},
  ...over,
});

function seed(jobs) {
  store.current = { jobData: { jobArray: jobs } };
}

beforeEach(() => {
  seed([]);
});

describe("linking the edited job to a parent", () => {
  it("names the job on the parent and the parent on the job", () => {
    const job = editedJob();
    const parent = otherJob("parent", 11567, { 587: [] });
    seed([parent]);

    const modified = applyParentChildChanges(
      noChanges({ parentJobs: { add: ["parent"], remove: [] } }),
      job,
      [],
    );

    expect(job.parentJobs).toEqual(["parent"]);
    expect(parent.build.childJobs[587]).toEqual(["edited"]);
    expect(modified).toEqual(new Set(["parent"]));
  });

  it("does not claim a parent the planner does not hold", () => {
    const job = editedJob();

    applyParentChildChanges(
      noChanges({ parentJobs: { add: ["gone"], remove: [] } }),
      job,
      [],
    );

    expect(job.parentJobs).toEqual([]);
  });
});

describe("cutting the edited job from a parent", () => {
  it("takes the job off the parent and the parent off the job", () => {
    const job = editedJob();
    job.parentJobs = ["parent"];
    const parent = otherJob("parent", 11567, { 587: ["edited"] });
    seed([parent]);

    const modified = applyParentChildChanges(
      noChanges({ parentJobs: { add: [], remove: ["parent"] } }),
      job,
      [],
    );

    expect(job.parentJobs).toEqual([]);
    expect(parent.build.childJobs[587]).toEqual([]);
    expect(modified).toEqual(new Set(["parent"]));
  });
});

describe("linking a child under a material", () => {
  it("names the job on the child and the child on the material", () => {
    const job = editedJob();
    const child = otherJob("child", TRITANIUM);
    seed([child]);

    const modified = applyParentChildChanges(
      noChanges({ childJobs: { [TRITANIUM]: { add: ["child"], remove: [] } } }),
      job,
      [],
    );

    expect(job.build.childJobs[TRITANIUM]).toEqual(["child"]);
    expect(child.parentJobs).toEqual(["edited"]);
    expect(modified).toEqual(new Set(["child"]));
  });

  it("takes a child off the material and the job off the child", () => {
    const job = editedJob();
    job.build.childJobs[TRITANIUM] = ["child"];
    const child = otherJob("child", TRITANIUM);
    child.parentJobs = ["edited"];
    seed([child]);

    applyParentChildChanges(
      noChanges({ childJobs: { [TRITANIUM]: { add: [], remove: ["child"] } } }),
      job,
      [],
    );

    expect(child.parentJobs).toEqual([]);
  });

  it("finds a child that is still in flight", () => {
    const job = editedJob();
    const child = otherJob("in-flight", TRITANIUM);

    const modified = applyParentChildChanges(
      noChanges({
        childJobs: { [TRITANIUM]: { add: ["in-flight"], remove: [] } },
      }),
      job,
      [child],
    );

    expect(child.parentJobs).toEqual(["edited"]);
    expect(modified).toEqual(new Set(["in-flight"]));
  });
});

describe("a change it cannot read", () => {
  it("answers that it changed nothing", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(applyParentChildChanges(null, editedJob(), [])).toEqual(new Set());

    expect(failed).toHaveBeenCalled();
    failed.mockRestore();
  });
});
