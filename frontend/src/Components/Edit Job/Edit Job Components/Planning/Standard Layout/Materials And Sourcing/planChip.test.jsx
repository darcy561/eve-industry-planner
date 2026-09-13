import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const findMaterialJobInGroup = vi.fn(() => null);
const finaliseCreatedChildJobs = vi.fn();
const useActiveGroupReadOnly = vi.fn(() => false);
const useSiblingLinkLock = vi.fn(() => ({ readOnly: false, reason: "" }));

vi.mock("../../../../../../Functions/Groups/findMaterialJobInGroup", () => ({
  findMaterialJobInGroup: (...args) => findMaterialJobInGroup(...args),
}));

vi.mock("./Helpers/finaliseCreatedChildJobs", () => ({
  finaliseCreatedChildJobs: (...args) => finaliseCreatedChildJobs(...args),
}));

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveGroupReadOnly: (...args) => useActiveGroupReadOnly(...args),
  useSiblingLinkLock: (...args) => useSiblingLinkLock(...args),
}));

vi.mock("../../../../../../analytics/trackNewJobsCreated", () => ({
  trackNewJobsCreated: vi.fn(),
}));

const { default: PlanChip } = await import("./planChip");
const { withQueryClient } = await import("../../../../../../tests/utils.js");

const material = { typeID: 34, name: "Tritanium" };
const speculative = { jobID: "spec-34", itemID: 34 };

const state = (overrides = {}) => ({
  activeJob: {
    groupID: "",
    includedInGroup: false,
    build: { childJobs: { 34: [] } },
    ...overrides.activeJob,
  },
  temporaryChildJobs: {},
  parentChildToEdit: { childJobs: {} },
  ...overrides,
});

const renderChip = (props = {}) => {
  const actions = {
    markChildJobsForRemoval: vi.fn(),
    forgetSpeculativeChildJobs: vi.fn(),
  };
  render(
    withQueryClient(
      <PlanChip
        state={state()}
        actions={actions}
        material={material}
        rowJob={speculative}
        {...props}
      />,
    ),
  );
  return actions;
};

beforeEach(() => {
  vi.clearAllMocks();
  findMaterialJobInGroup.mockReturnValue(null);
  useActiveGroupReadOnly.mockReturnValue(false);
  useSiblingLinkLock.mockReturnValue({ readOnly: false, reason: "" });
});

describe("the plan chip", () => {
  it("reads as Buy until something is committed", () => {
    renderChip();

    expect(screen.getByText("Buy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build it" })).toBeEnabled();
  });

  it("promotes the costed job when told to build", async () => {
    renderChip();

    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(finaliseCreatedChildJobs).toHaveBeenCalledWith(
      expect.objectContaining({ jobsToMarkForAddition: speculative }),
    );
  });

  // Nothing costed and no way to cost it — the control says why rather than
  // failing on click. A panel that can cost the row passes `costRow`, and the
  // case below covers that.
  it("cannot build a row it has no way to cost", () => {
    renderChip({ rowJob: null, costRow: undefined });

    expect(screen.getByRole("button", { name: "Build it" })).toBeDisabled();
  });

  it("reads as Build once a job is marked, and offers the way back", async () => {
    const tempJob = { jobID: "temp-34", itemID: 34 };
    const actions = renderChip({
      state: state({ temporaryChildJobs: { 34: tempJob } }),
    });

    expect(screen.getByText("Build")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Buy instead" }));

    expect(actions.markChildJobsForRemoval).toHaveBeenCalledWith(tempJob);
  });

  // The commonest case there is: a child job linked in an earlier session, no
  // group involved. The chip has to be able to sever that link, not merely
  // report it — a button that reads as live and does nothing is worse than none.
  it("severs a link committed before this session", async () => {
    const linkedJob = { jobID: "linked-34", itemID: 34 };
    const actions = renderChip({
      state: state({
        activeJob: { build: { childJobs: { 34: ["linked-34"] } } },
      }),
      rowJob: linkedJob,
    });

    expect(screen.getByText("Build")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Buy instead" }));

    expect(actions.markChildJobsForRemoval).toHaveBeenCalledWith(linkedJob);
  });

  // Severing a link is the sibling lock's business wherever it happens, which is
  // what the rest of the app gates unlinking on.
  it("gates the way back on the sibling lock, group or not", () => {
    useSiblingLinkLock.mockReturnValue({ readOnly: true, reason: "locked" });

    renderChip({
      state: state({
        activeJob: { build: { childJobs: { 34: ["linked-34"] } } },
      }),
      rowJob: { jobID: "linked-34", itemID: 34 },
    });

    expect(screen.getByRole("button", { name: "Buy instead" })).toBeDisabled();
  });

  it("offers no way back when nothing names the linked job", () => {
    renderChip({
      state: state({
        activeJob: { build: { childJobs: { 34: ["linked-34"] } } },
      }),
      rowJob: null,
    });

    expect(screen.getByRole("button", { name: "Buy instead" })).toBeDisabled();
  });
});

// The panel costs an uncommitted job against the whole requirement because
// committing sizes it to match, so committing has to actually ask for that.
describe("committing a job built for this row", () => {
  it("sizes it to what this row needs", async () => {
    renderChip();
    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(finaliseCreatedChildJobs).toHaveBeenCalledWith(
      expect.objectContaining({ requiredQuantity: material.quantity }),
    );
  });
});

// A group that already builds the material links its job rather than creating a
// second one that makes the same thing.
describe("the plan chip inside a group", () => {
  const groupJob = { jobID: "group-34", itemID: 34 };
  const inGroup = () =>
    state({
      activeJob: {
        groupID: "g1",
        includedInGroup: true,
        build: { childJobs: { 34: [] } },
      },
    });

  it("offers to build within the group", () => {
    findMaterialJobInGroup.mockReturnValue(groupJob);

    renderChip({ state: inGroup() });

    expect(
      screen.getByRole("button", { name: "Build in this group" }),
    ).toBeInTheDocument();
  });

  it("links the group's own job rather than the costed one", async () => {
    findMaterialJobInGroup.mockReturnValue(groupJob);

    renderChip({ state: inGroup() });
    await userEvent.click(
      screen.getByRole("button", { name: "Build in this group" }),
    );

    expect(finaliseCreatedChildJobs).toHaveBeenCalledWith(
      expect.objectContaining({ jobsToMarkForAddition: groupJob }),
    );
  });

  // The group's job may already be feeding another job in the group. Sizing it
  // to this row's requirement alone would take that job's supply away without
  // either of them being told.
  it("does not resize a job the group already runs", async () => {
    findMaterialJobInGroup.mockReturnValue(groupJob);

    renderChip({ state: inGroup() });
    await userEvent.click(
      screen.getByRole("button", { name: "Build in this group" }),
    );

    expect(finaliseCreatedChildJobs).toHaveBeenCalledWith(
      expect.objectContaining({ requiredQuantity: undefined }),
    );
  });

  // Linking a sibling and creating a new child are locked separately, and the
  // chip must gate on whichever it would actually do.
  it("gates on the sibling lock when it would link", () => {
    findMaterialJobInGroup.mockReturnValue(groupJob);
    useSiblingLinkLock.mockReturnValue({ readOnly: true, reason: "locked" });

    renderChip({ state: inGroup() });

    expect(
      screen.getByRole("button", { name: "Build in this group" }),
    ).toBeDisabled();
  });

  it("gates on the group lock when it would create", () => {
    useActiveGroupReadOnly.mockReturnValue(true);

    renderChip();

    expect(screen.getByRole("button", { name: "Build it" })).toBeDisabled();
  });
});

// The row reads what it was costed with to decide what confirming would act on.
// A job that has since become a real child job, or been taken back out, is no
// longer a guess about anything — and the row above the drawer is now the thing
// reading it, so a copy left behind is read rather than merely stored.
describe("what the row was costed with, once it has been decided", () => {
  it("is dropped when the row is built", async () => {
    const actions = renderChip();

    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(actions.forgetSpeculativeChildJobs).toHaveBeenCalledWith(34);
  });

  // Otherwise the bulk costing counts the row as priced and never quotes it
  // again, and opening its drawer shows the figure from the job that was just
  // removed rather than costing it afresh.
  it("is dropped when the row goes back to being bought", async () => {
    const actions = renderChip({
      state: state({ temporaryChildJobs: { 34: { jobID: "temp-34" } } }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Buy instead" }));

    expect(actions.forgetSpeculativeChildJobs).toHaveBeenCalledWith(34);
  });

  // Nothing was decided, so nothing is forgotten — a row whose control is
  // disabled for want of a costing must not clear the costing of anything.
  it("is left alone when there was nothing to confirm", async () => {
    const actions = renderChip({ rowJob: null });

    const build = screen.getByRole("button", { name: "Build it" });

    expect(build).toBeDisabled();
    expect(actions.forgetSpeculativeChildJobs).not.toHaveBeenCalled();
  });

  // A group's own job was never costed into this map — it is a real job the row
  // would link to — but the row may still have been costed before the group
  // gained it, so the entry is cleared on the same terms.
  it("is dropped when the row links the group's own job", async () => {
    findMaterialJobInGroup.mockReturnValue({ jobID: "group-34", itemID: 34 });
    const actions = renderChip({
      state: state({
        activeJob: {
          includedInGroup: true,
          groupID: "g1",
          build: { childJobs: { 34: [] } },
        },
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Build in this group" }),
    );

    expect(actions.forgetSpeculativeChildJobs).toHaveBeenCalledWith(34);
  });
});

// Deciding to build is not a reason to have read the row's drawer first. A row
// nobody has opened has nothing costed for it, so the control costs it and then
// shows what it made.
describe("building a row that has not been costed", () => {
  it("offers to build a row nothing has costed yet", () => {
    renderChip({ rowJob: null, costRow: vi.fn() });

    expect(screen.getByRole("button", { name: "Build it" })).toBeEnabled();
  });

  it("costs the row, then commits what it costed", async () => {
    const costed = { jobID: "costed-34", itemID: 34 };
    const costRow = vi.fn(async () => costed);

    renderChip({ rowJob: null, costRow });

    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(costRow).toHaveBeenCalled();
    expect(finaliseCreatedChildJobs).toHaveBeenCalledWith(
      expect.objectContaining({ jobsToMarkForAddition: costed }),
    );
  });

  // The row has something new to look at once it has been built.
  it("shows the row afterwards", async () => {
    const onBuilt = vi.fn();
    renderChip({
      rowJob: null,
      costRow: vi.fn(async () => ({ jobID: "costed-34", itemID: 34 })),
      onBuilt,
    });

    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(onBuilt).toHaveBeenCalled();
  });

  // Costing reaches the network, so a second press while it runs would build the
  // row twice.
  it("cannot be pressed again while it is costing", async () => {
    let settle;
    const costRow = vi.fn(() => new Promise((res) => (settle = res)));

    renderChip({ rowJob: null, costRow });
    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(screen.getByRole("button", { name: "Costing" })).toBeDisabled();

    settle({ jobID: "costed-34", itemID: 34 });
  });

  it("commits nothing when the row cannot be costed", async () => {
    renderChip({ rowJob: null, costRow: vi.fn(async () => null) });

    await userEvent.click(screen.getByRole("button", { name: "Build it" }));

    expect(finaliseCreatedChildJobs).not.toHaveBeenCalled();
  });
});
