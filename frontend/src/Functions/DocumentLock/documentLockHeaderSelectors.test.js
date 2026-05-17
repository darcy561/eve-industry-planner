import { describe, expect, it } from "vitest";
import {
  primaryHeaderRegistration,
  selectActiveDlLockHeld,
  selectActiveDlReadOnly,
  selectHeaderDocumentLockActive,
} from "./documentLockHeaderSelectors.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "./documentLockCollections.js";
import { docLockScopeKey } from "./documentLockScope.js";

function rootState({ registrations, scopes = {} }) {
  return {
    headerDocumentLockUI: { registrations },
    documentLock: { scopes },
  };
}

describe("documentLockHeaderSelectors", () => {
  it("selectHeaderDocumentLockActive is false when no registrations", () => {
    expect(selectHeaderDocumentLockActive(rootState({ registrations: [] }))).toBe(false);
  });

  it("primaryHeaderRegistration prefers job over group when both enabled", () => {
    const regs = [
      { collection: USER_JOB_GROUPS_COLLECTION, docID: "g1", enabled: true },
      { collection: USER_JOBS_COLLECTION, docID: "j1", enabled: true },
    ];
    const p = primaryHeaderRegistration(rootState({ registrations: regs }));
    expect(p?.collection).toBe(USER_JOBS_COLLECTION);
    expect(p?.docID).toBe("j1");
  });

  it("primaryHeaderRegistration ignores disabled entries", () => {
    const regs = [
      { collection: USER_JOBS_COLLECTION, docID: "j1", enabled: false },
      { collection: USER_JOBS_COLLECTION, docID: "j2", enabled: true },
    ];
    const p = primaryHeaderRegistration(rootState({ registrations: regs }));
    expect(p?.docID).toBe("j2");
  });

  it("selectActiveDlReadOnly / selectActiveDlLockHeld follow primary registration scope", () => {
    const jk = docLockScopeKey(USER_JOBS_COLLECTION, "j9");
    const s = rootState({
      registrations: [
        { collection: USER_JOBS_COLLECTION, docID: "j9", enabled: true },
      ],
      scopes: {
        [jk]: { readOnly: true, lockHeld: false },
      },
    });
    expect(selectActiveDlReadOnly(s)).toBe(true);
    expect(selectActiveDlLockHeld(s)).toBe(false);
  });
});
