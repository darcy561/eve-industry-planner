import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useJobDeletedRemotely } from "./useJobDeletedRemotely.js";
import { JOBS_DELETED_REMOTELY_EVENT } from "../../../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import {
  resetSnackbars,
  snackbarSpies,
} from "../../../tests/snackbarHarness.js";

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { showSnackbarWarning } = snackbarSpies;

beforeEach(() => {
  resetSnackbars();
  showSnackbarWarning.mockClear();
});

/** The announcement the coalescer makes once the arrays no longer hold them. */
function deletedRemotely(...jobIDs) {
  window.dispatchEvent(
    new CustomEvent(JOBS_DELETED_REMOTELY_EVENT, { detail: { jobIDs } }),
  );
}

describe("a job deleted while its reader has it open", () => {
  it("tells the reader when the job they are in is the one deleted", () => {
    renderHook(() => useJobDeletedRemotely("job-1"));

    deletedRemotely("job-other", "job-1");

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("deleted by someone else"),
      expect.any(Number),
    );
  });

  it("says nothing about a job the reader is not in", () => {
    renderHook(() => useJobDeletedRemotely("job-1"));

    deletedRemotely("job-other");

    expect(showSnackbarWarning).not.toHaveBeenCalled();
  });

  // The editor unmounts when the reader leaves, and a listener outliving it
  // would speak for a page that is gone.
  it("stops listening once the editor has gone", () => {
    const { unmount } = renderHook(() => useJobDeletedRemotely("job-1"));

    unmount();
    deletedRemotely("job-1");

    expect(showSnackbarWarning).not.toHaveBeenCalled();
  });
});
