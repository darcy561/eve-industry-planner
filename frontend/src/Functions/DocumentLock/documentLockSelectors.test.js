import { describe, expect, it } from "vitest";
import {
  filterUnlockedDocumentIDs,
  selectDocumentLockReadOnly,
  selectScopedDocumentLock,
} from "./documentLockSelectors.js";
import { docLockScopeKey } from "./documentLockScope.js";

function stateWithScopes(scopes) {
  return { documentLock: { scopes } };
}

describe("documentLockSelectors", () => {
  it("selectScopedDocumentLock merges defaults for unknown scope", () => {
    const s = stateWithScopes({});
    const merged = selectScopedDocumentLock(s, "job_documents", "j1");
    expect(merged.readOnly).toBe(false);
    expect(merged.lockHeld).toBe(false);
    expect(merged.viewerCount).toBe(0);
  });

  it("selectScopedDocumentLock overlays stored fields", () => {
    const k = docLockScopeKey("job_documents", "j1");
    const s = stateWithScopes({
      [k]: { readOnly: true, lockHeld: false, viewerCount: 2 },
    });
    const merged = selectScopedDocumentLock(s, "job_documents", "j1");
    expect(merged.readOnly).toBe(true);
    expect(merged.viewerCount).toBe(2);
  });

  it("selectDocumentLockReadOnly reads merged readOnly", () => {
    const k = docLockScopeKey("job_documents", "j1");
    const s = stateWithScopes({ [k]: { readOnly: true } });
    expect(selectDocumentLockReadOnly(s, "job_documents", "j1")).toBe(true);
  });

  it("filterUnlockedDocumentIDs drops read-only ids", () => {
    const k1 = docLockScopeKey("job_documents", "a");
    const k2 = docLockScopeKey("job_documents", "b");
    const s = stateWithScopes({
      [k1]: { readOnly: true },
      [k2]: { readOnly: false },
    });
    expect(
      filterUnlockedDocumentIDs(s, "job_documents", ["a", "b", "c"])
    ).toEqual(["b", "c"]);
  });

  it("filterUnlockedDocumentIDs returns empty for bad inputs", () => {
    expect(filterUnlockedDocumentIDs({}, "", ["a"])).toEqual([]);
    expect(filterUnlockedDocumentIDs(stateWithScopes({}), "job_documents", null)).toEqual(
      []
    );
  });
});
