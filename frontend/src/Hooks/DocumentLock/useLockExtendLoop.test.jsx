import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DOCUMENT_LOCK_RENEW_REQUEST_EVENT } from "../../Functions/DocumentLock/documentLockEvents.js";
import { extendDocumentLock } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { useLockExtendLoop } from "./useLockExtendLoop.js";

vi.mock("../../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
  extendDocumentLock: vi.fn(),
}));

describe("useLockExtendLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extendDocumentLock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ holding: true, expiresAtUnix: 9e9, ttlSeconds: 300 }),
    });
  });

  it("flushes extend when renew-request event matches keyRef scope", async () => {
    const keyRef = { current: { collection: "c1", docID: "d1" } };
    const patch = vi.fn();
    const dispatchHeld = vi.fn();
    const syncLockFromServer = vi.fn();

    renderHook(() =>
      useLockExtendLoop({
        enabled: true,
        lockHeld: true,
        readOnly: false,
        patch,
        dispatchHeld,
        keyRef,
        syncLockFromServer,
      })
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DOCUMENT_LOCK_RENEW_REQUEST_EVENT, {
          detail: { collection: "c1", docID: "d1" },
        })
      );
    });

    expect(extendDocumentLock).toHaveBeenCalledWith("c1", "d1");
  });

  it("ignores renew-request for a different scope", async () => {
    const keyRef = { current: { collection: "c1", docID: "d1" } };
    renderHook(() =>
      useLockExtendLoop({
        enabled: true,
        lockHeld: true,
        readOnly: false,
        patch: vi.fn(),
        dispatchHeld: vi.fn(),
        keyRef,
        syncLockFromServer: vi.fn(),
      })
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DOCUMENT_LOCK_RENEW_REQUEST_EVENT, {
          detail: { collection: "other", docID: "d1" },
        })
      );
    });

    expect(extendDocumentLock).not.toHaveBeenCalled();
  });
});
