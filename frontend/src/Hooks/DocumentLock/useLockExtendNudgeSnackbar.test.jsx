import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { showDocumentLockExtendNudgeSnackbar } from "../../Events/snackbarEvents.js";
import { useLockExtendNudgeSnackbar } from "./useLockExtendNudgeSnackbar.js";

vi.mock("../../Events/snackbarEvents.js", () => ({
  showDocumentLockExtendNudgeSnackbar: vi.fn(),
}));

describe("useLockExtendNudgeSnackbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows once while low, resets after expiry moves out of band, then can show again", () => {
    const base = Math.floor(Date.now() / 1000);
    const props = {
      enabled: true,
      collection: "c",
      docID: "d",
      lockHeld: true,
      readOnly: false,
      leasePressure: true,
      lockExpiresAtUnix: base + 45,
      handoffPendingHolder: false,
      extendNudgeMessage: "nudge",
    };

    const { rerender } = renderHook((p) => useLockExtendNudgeSnackbar(p), {
      initialProps: props,
    });

    expect(showDocumentLockExtendNudgeSnackbar).not.toHaveBeenCalled();

    rerender({ ...props, lockExpiresAtUnix: base + 20 });
    expect(showDocumentLockExtendNudgeSnackbar).toHaveBeenCalledTimes(1);
    expect(showDocumentLockExtendNudgeSnackbar).toHaveBeenCalledWith("nudge", {
      collection: "c",
      docID: "d",
    });

    rerender({ ...props, lockExpiresAtUnix: base + 15 });
    expect(showDocumentLockExtendNudgeSnackbar).toHaveBeenCalledTimes(1);

    rerender({ ...props, lockExpiresAtUnix: base + 400 });
    expect(showDocumentLockExtendNudgeSnackbar).toHaveBeenCalledTimes(1);

    rerender({ ...props, lockExpiresAtUnix: base + 28 });
    expect(showDocumentLockExtendNudgeSnackbar).toHaveBeenCalledTimes(2);
  });
});
