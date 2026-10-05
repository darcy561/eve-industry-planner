import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MergeJobsDialogue from "./MergeJobsDialogue.jsx";
import {
  confirmMergeDiscards,
  showMergeRefused,
} from "../../../Events/mergeJobsEvents";
import { JOB_MOVED } from "../../../Functions/Job/changes/jobChange";

const discard = {
  jobID: "old-1",
  name: "Rifter",
  purchases: 2,
  extraCosts: 1,
  inventionEntries: 0,
  industryJobs: 0,
  marketOrders: 0,
  transactions: 0,
};

function asked() {
  render(<MergeJobsDialogue />);
  let answer;
  act(() => {
    answer = confirmMergeDiscards([discard]);
  });
  return answer;
}

describe("confirming what a merge discards", () => {
  it("lists what each replaced job recorded", () => {
    asked();

    expect(screen.getByText("Rifter")).toBeInTheDocument();
    expect(screen.getByText("2 purchases · 1 extra cost")).toBeInTheDocument();
  });

  it("answers yes when the reader merges", async () => {
    const answer = asked();

    await userEvent.click(screen.getByRole("button", { name: "Merge" }));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText("Rifter")).not.toBeInTheDocument();
  });

  it("answers no when the reader cancels", async () => {
    const answer = asked();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(answer).resolves.toBe(false);
  });
});

describe("a confirmation replaced before it was answered", () => {
  it("answers no for the one replaced", async () => {
    const first = asked();

    act(() => {
      confirmMergeDiscards([{ ...discard, jobID: "old-2", name: "Wolf" }]);
    });

    await expect(first).resolves.toBe(false);
    expect(screen.getByText("Wolf")).toBeInTheDocument();
  });
});

describe("a refused merge", () => {
  it("names each job that moved and merges again on request", async () => {
    render(<MergeJobsDialogue />);
    const mergeAgain = vi.fn().mockResolvedValue(undefined);
    act(() => {
      showMergeRefused(
        [
          { jobID: "a", name: "Rifter", reason: JOB_MOVED.EDITED },
          { jobID: "b", name: "Wolf", reason: JOB_MOVED.GONE },
        ],
        mergeAgain,
      );
    });

    expect(
      screen.getByText("Edited since you selected it"),
    ).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Merge again" }));

    expect(mergeAgain).toHaveBeenCalledOnce();
  });

  it("will not merge again while a job is open elsewhere", () => {
    render(<MergeJobsDialogue />);
    act(() => {
      showMergeRefused(
        [{ jobID: "a", name: "Rifter", reason: JOB_MOVED.HELD }],
        vi.fn(),
      );
    });

    expect(screen.getByText("Open for editing elsewhere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge again" })).toBeDisabled();
    expect(
      screen.getByText("Wait until the jobs open elsewhere are closed"),
    ).toBeInTheDocument();
  });
});
