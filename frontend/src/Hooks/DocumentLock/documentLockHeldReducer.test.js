import { describe, expect, it } from "vitest";
import {
  documentLockHeldReducer,
  DOCUMENT_LOCK_HELD_ACTIONS,
} from "./documentLockHeldReducer.js";

describe("documentLockHeldReducer", () => {
  it("syncs from store", () => {
    expect(
      documentLockHeldReducer(
        { held: false },
        { type: DOCUMENT_LOCK_HELD_ACTIONS.SYNC_FROM_STORE, lockHeld: true }
      )
    ).toEqual({ held: true });
    expect(
      documentLockHeldReducer(
        { held: true },
        { type: DOCUMENT_LOCK_HELD_ACTIONS.SYNC_FROM_STORE, lockHeld: false }
      )
    ).toEqual({ held: false });
  });

  it("sets explicit held flag", () => {
    expect(
      documentLockHeldReducer(
        { held: true },
        { type: DOCUMENT_LOCK_HELD_ACTIONS.SET, held: false }
      )
    ).toEqual({ held: false });
  });

  it("coerces to boolean", () => {
    expect(
      documentLockHeldReducer(
        { held: false },
        { type: DOCUMENT_LOCK_HELD_ACTIONS.SYNC_FROM_STORE, lockHeld: 1 }
      )
    ).toEqual({ held: true });
  });

  it("ignores unknown actions", () => {
    const s = { held: true };
    expect(documentLockHeldReducer(s, { type: "unknown" })).toBe(s);
  });
});
