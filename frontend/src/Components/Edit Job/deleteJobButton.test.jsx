import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";

import { renderOverEditJob, storedJob } from "../../tests/editJobHarness";

const { store, deleted, navigated, outcome, gate } = vi.hoisted(() => ({
  store: { current: null },
  gate: { canPersist: true },
  deleted: [],
  navigated: [],
  outcome: { current: true },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (to) => navigated.push(to),
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => ({}),
}));
vi.mock("../../Functions/Job/changes/deleteMultipleJobs", () => ({
  default: async (jobID) => {
    deleted.push(jobID);
    return outcome.current;
  },
}));
vi.mock(
  "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({ yieldEditJobDocumentLocksOnLeave: async () => {} }),
);
vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobPersistGate: () => {
    const [, refresh] = useState(0);
    gate.refresh = refresh;
    return { canPersist: gate.canPersist, readOnly: false };
  },
}));

const { DeleteJobButton } = await import("./deleteJobButton");

const parents = {
  "parent-1": {
    jobID: "parent-1",
    build: { materials: { 587: { typeID: 587, quantity: 3 } }, childJobs: {} },
  },
  "parent-2": {
    jobID: "parent-2",
    build: { materials: { 587: { typeID: 587, quantity: 4 } }, childJobs: {} },
  },
};

const makingTen = (overrides = {}) =>
  storedJob({
    itemsProducedPerRun: 1,
    build: {
      setup: { setup0: { id: "setup0", runCount: 10, jobCount: 1 } },
      materials: {},
      childJobs: {},
    },
    ...overrides,
  });

beforeEach(() => {
  deleted.length = 0;
  navigated.length = 0;
  outcome.current = true;
  gate.canPersist = true;
  store.current = {
    jobData: { actions: { findJobInJobArray: (id) => parents[id] } },
  };
});

const pressDelete = () =>
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));

describe("deleting the open job", () => {
  it("asks first, and deletes nothing until the reader confirms", () => {
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();

    expect(screen.getByText("Delete Rifter?")).toBeTruthy();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    expect(deleted).toEqual([]);
  });

  it("keeps the job when the reader backs out", () => {
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByText("Delete Rifter?")).toBeNull();
    expect(deleted).toEqual([]);
    expect(navigated).toEqual([]);
  });

  it("names the parents and what they lose", () => {
    renderOverEditJob(
      makingTen({ parentJobs: ["parent-1", "parent-2"] }),
      () => <DeleteJobButton />,
    );

    pressDelete();

    expect(screen.getByText("2 parent jobs")).toBeTruthy();
    expect(screen.getByText(/lose the 7 units it was covering/)).toBeTruthy();
  });

  it("says nothing about parents when the job has none", () => {
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();

    expect(screen.queryByText(/parent job/)).toBeNull();
  });

  it("deletes and leaves once confirmed", async () => {
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();
    fireEvent.click(screen.getByRole("button", { name: "Delete the job" }));

    await vi.waitFor(() =>
      expect(navigated).toContainEqual({ to: "/jobplanner" }),
    );
    expect(deleted).toEqual(["job-1"]);
  });

  it("stays on the job and closes the question when the delete is refused", async () => {
    outcome.current = false;
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();
    fireEvent.click(screen.getByRole("button", { name: "Delete the job" }));

    await vi.waitFor(() =>
      expect(screen.queryByText("Delete Rifter?")).toBeNull(),
    );
    expect(navigated).toEqual([]);
  });

  it("names the parents without a loss when their need is already met", () => {
    renderOverEditJob(makingTen({ parentJobs: ["parent-unloaded"] }), () => (
      <DeleteJobButton />
    ));

    pressDelete();

    expect(screen.getByText("1 parent job")).toBeTruthy();
    expect(screen.queryByText(/units it was covering/)).toBeNull();
  });

  it("deletes nothing when edit access is lost while the question is open", async () => {
    renderOverEditJob(makingTen(), () => <DeleteJobButton />);

    pressDelete();
    await act(async () => {
      gate.canPersist = false;
      gate.refresh((n) => n + 1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete the job" }));

    await vi.waitFor(() =>
      expect(screen.queryByText("Delete Rifter?")).toBeNull(),
    );
    expect(deleted).toEqual([]);
  });
});
