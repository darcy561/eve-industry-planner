import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../Zustand/usersStore", async () => {
  const { create } = await import("zustand");
  const { default: editSessionSlice } =
    await import("../../../Zustand/editSessionSlice.js");
  return { default: create(editSessionSlice) };
});

const persist = { canPersist: true };
vi.mock("../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobPersistGate: () => persist,
}));

const saveAndLeave = vi.fn().mockResolvedValue(undefined);
vi.mock("../Edit Job Hooks/saveOpenJob", async (importOriginal) => ({
  ...(await importOriginal()),
  useSaveAndLeave: () => saveAndLeave,
}));

const { default: useUsersStore } = await import("../../../Zustand/usersStore");
const { default: ChangeReviewDialogue } =
  await import("./ChangeReviewDialogue.jsx");
const { default: IncomingSaveNotice } =
  await import("./IncomingSaveNotice.jsx");
const { openChangeReview } = await import("../../../Events/changeReviewEvents");

const session = () => useUsersStore.getState().editSession;

const aJob = (overrides = {}) => ({
  jobID: "job-1",
  name: "Hulk",
  jobStatus: 1,
  build: { setup: { s1: { id: "s1", runCount: 3 } } },
  ...overrides,
});

function editThenReceive() {
  session().actions.closeSession();
  session().actions.openJob("job-1", aJob());
  session().actions.run({
    name: "Set run count",
    recipe: (job) => {
      job.build.setup.s1.runCount = 4;
    },
  });
  session().actions.run({
    name: "Set status",
    recipe: (job) => {
      job.jobStatus = 2;
    },
  });
  session().actions.documentArrived(
    "job-1",
    aJob({ build: { setup: { s1: { id: "s1", runCount: 5 } } } }),
  );
}

function runCount() {
  return session().draft.drafts["job-1"].build.setup.s1.runCount;
}

beforeEach(() => {
  saveAndLeave.mockClear();
  persist.canPersist = true;
  editThenReceive();
});

describe("the notice an incoming save leaves", () => {
  it("says what was set aside without opening the review", () => {
    render(
      <>
        <IncomingSaveNotice />
        <ChangeReviewDialogue />
      </>,
    );

    expect(
      screen.getByText("An incoming save changed Hulk while you had it open"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one of your changes needs you to choose/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(runCount()).toBe(4);
  });

  it("opens the review when the reader asks", async () => {
    render(
      <>
        <IncomingSaveNotice />
        <ChangeReviewDialogue />
      </>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Review changes" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });
});

describe("reviewing a refused save", () => {
  const openRefused = () => {
    render(<ChangeReviewDialogue />);
    act(() => openChangeReview({ refused: true }));
  };

  it("lists each change by how it stands, with both values for a conflict", () => {
    openRefused();

    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument();
    expect(screen.getByLabelText("Keep mine — 4")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Take the incoming save — 5"),
    ).toBeInTheDocument();
    expect(screen.getByText("Set status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save again" })).toBeDisabled();
  });

  it("saves again with the reader's value once they keep it", async () => {
    openRefused();

    await userEvent.click(screen.getByLabelText("Keep mine — 4"));
    await userEvent.click(screen.getByRole("button", { name: "Save again" }));

    expect(runCount()).toBe(4);
    expect(session().draft.held).toEqual([]);
    expect(session().draft.log.map((entry) => entry.command)).toEqual([
      "Set run count",
      "Set status",
    ]);
    expect(saveAndLeave).toHaveBeenCalledOnce();
  });

  it("takes the incoming save and lets an unticked change go", async () => {
    openRefused();

    await userEvent.click(screen.getByLabelText("Take the incoming save — 5"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Save again" }));

    expect(runCount()).toBe(5);
    expect(session().draft.log).toEqual([]);
    expect(saveAndLeave).toHaveBeenCalledOnce();
  });

  it("leaves everything set aside when the reader keeps editing", async () => {
    openRefused();

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(session().draft.held).toHaveLength(1);
    expect(saveAndLeave).not.toHaveBeenCalled();
  });

  it("will not save once the reader no longer holds the job", async () => {
    persist.canPersist = false;
    openRefused();

    await userEvent.click(screen.getByLabelText("Keep mine — 4"));

    expect(screen.getByRole("button", { name: "Save again" })).toBeDisabled();
    expect(
      screen.getByText("You no longer hold this job, so it cannot be saved"),
    ).toBeInTheDocument();
  });
});
