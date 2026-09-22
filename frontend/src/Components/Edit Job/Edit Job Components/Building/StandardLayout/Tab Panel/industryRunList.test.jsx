import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { IndustryRunList } from "./industryRunList.jsx";

/**
 * The list is what holds a pressed row on screen while it fades. The write
 * behind the press has already landed by then — which is the whole point of the
 * hold — so what these cover is the row surviving its own removal for exactly
 * as long as the transition, and not a moment more.
 */

const FADE_MS = 800;

function row(jobID) {
  return {
    key: `run-${jobID}`,
    run: { job_id: jobID, runs: 3, is_corporation: false },
    owner: { CharacterID: 900, CharacterName: "Builder" },
    blueprintTypeID: 1,
    blueprintType: "Manufacturing",
    facilityName: "Jita IV - Moon 4",
    statusLabel: "Active",
    statusColour: "warning",
    progress: 50,
    readyToDeliver: false,
    timeRemaining: "5H",
    installCost: null,
  };
}

function show(rows, onSelect = () => {}) {
  return render(
    <IndustryRunList
      rows={rows}
      tooltip="Press to link"
      disabledTooltip="Linking is disabled"
      disabled={false}
      onSelect={onSelect}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a list of industry runs", () => {
  it("keeps a pressed row on screen while it fades, then drops it", () => {
    const { rerender } = show([row(1)]);

    fireEvent.click(screen.getByText("3 Runs"));
    // The write has taken the run off the job, so the row is gone from what the
    // list is given.
    rerender(
      <IndustryRunList
        rows={[]}
        tooltip="Press to link"
        disabledTooltip="Linking is disabled"
        disabled={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("3 Runs")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(FADE_MS);
    });

    expect(screen.queryByText("3 Runs")).toBeNull();
  });

  it("draws a row once while it is both held and still given", () => {
    show([row(1)]);

    fireEvent.click(screen.getByText("3 Runs"));

    expect(screen.getAllByText("3 Runs")).toHaveLength(1);
  });

  it("says a row was pressed once however many times it is pressed", () => {
    const onSelect = vi.fn();
    show([row(1)], onSelect);

    const card = screen.getByText("3 Runs");
    fireEvent.click(card);
    fireEvent.click(card);
    fireEvent.click(card);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("offers nothing on a row that is fading out", async () => {
    show([row(1)]);

    const card = screen.getByText("3 Runs");
    fireEvent.mouseOver(card);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Press to link",
    );

    fireEvent.click(card);
    fireEvent.mouseLeave(card);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.mouseOver(card);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("leaves no timer running when the tab is closed mid-fade", () => {
    const { unmount } = show([row(1), row(2)]);

    fireEvent.click(screen.getAllByText("3 Runs")[0]);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
