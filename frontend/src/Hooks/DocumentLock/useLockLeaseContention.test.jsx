import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLockLeaseContentionEffects } from "./useLockLeaseContention.js";

describe("useLockLeaseContentionEffects", () => {
  it("syncs from server when lease pressure turns on (does not extend)", () => {
    const syncLockFromServer = vi.fn();

    const { rerender } = renderHook(
      (props) => useLockLeaseContentionEffects(props),
      {
        initialProps: {
          enabled: true,
          collection: "c",
          docID: "d",
          lockHeld: true,
          readOnly: false,
          leasePressure: false,
          syncLockFromServer,
        },
      }
    );

    expect(syncLockFromServer).not.toHaveBeenCalled();

    rerender({
      enabled: true,
      collection: "c",
      docID: "d",
      lockHeld: true,
      readOnly: false,
      leasePressure: true,
      syncLockFromServer,
    });

    expect(syncLockFromServer).toHaveBeenCalledTimes(1);
  });

  it("syncs when lease pressure clears", () => {
    const syncLockFromServer = vi.fn();

    const { rerender } = renderHook(
      (props) => useLockLeaseContentionEffects(props),
      {
        initialProps: {
          enabled: true,
          collection: "c",
          docID: "d",
          lockHeld: true,
          readOnly: false,
          leasePressure: true,
          syncLockFromServer,
        },
      }
    );

    syncLockFromServer.mockClear();

    rerender({
      enabled: true,
      collection: "c",
      docID: "d",
      lockHeld: true,
      readOnly: false,
      leasePressure: false,
      syncLockFromServer,
    });

    expect(syncLockFromServer).toHaveBeenCalledTimes(1);
  });
});
