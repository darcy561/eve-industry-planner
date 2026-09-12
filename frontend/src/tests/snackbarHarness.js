import { vi } from "vitest";

/**
 * The snackbar events as a test sees them.
 *
 * A partial mock of this module is a trap rather than a shortcut: Vitest throws
 * on an export the factory left out, so a file that mocks the two functions its
 * component calls today fails on setup the moment that component reaches for a
 * third — with an error about the mock's shape rather than about behaviour. The
 * mock here covers every export, so that cannot happen.
 *
 * What each call said is recorded, because the interesting question about a
 * snackbar is usually what the reader was told rather than that something fired.
 */

/**
 * Every snackbar raised since the last {@link resetSnackbars}, oldest first.
 *
 * Entries carry the whole call: `kind` names the export, `severity` and
 * `message` are what the reader sees, and `scope` holds the collection and
 * document a lock snackbar was about.
 *
 * @type {Array<{kind: string, message: string, severity: string, duration: number|null, action: string|null, scope: {collection?: string, docID?: string}|null}>}
 */
export const snackbars = [];

function record(entry) {
  snackbars.push({
    severity: "info",
    duration: 1,
    action: null,
    scope: null,
    ...entry,
  });
}

/**
 * The spies, one per export, so a test can assert with `toHaveBeenCalledWith`
 * against the arguments a call site passed rather than against the recorded
 * shape. They record as a side effect, so the two ways of asking stay in step.
 */
export const snackbarSpies = {
  showSnackbar: vi.fn(
    (message, severity = "info", duration = 1, action = null) =>
      record({ kind: "showSnackbar", message, severity, duration, action }),
  ),
  showSnackbarSuccess: vi.fn((message, duration = 1) =>
    record({
      kind: "showSnackbarSuccess",
      message,
      severity: "success",
      duration,
    }),
  ),
  showSnackbarError: vi.fn((message, duration = 1) =>
    record({ kind: "showSnackbarError", message, severity: "error", duration }),
  ),
  showSnackbarWarning: vi.fn((message, duration = 1) =>
    record({
      kind: "showSnackbarWarning",
      message,
      severity: "warning",
      duration,
    }),
  ),
  showSnackbarInfo: vi.fn((message, duration = 1) =>
    record({ kind: "showSnackbarInfo", message, severity: "info", duration }),
  ),
  showVersionUpdateSnackbar: vi.fn((targetVersion, onDismiss) =>
    record({
      kind: "showVersionUpdateSnackbar",
      message: "New app version available! Click refresh to update.",
      duration: null,
      action: "VERSION_UPDATE",
      targetVersion,
      onDismiss,
    }),
  ),
  showDocumentLockAccessRequestSnackbar: vi.fn((message, scope = {}) =>
    record({
      kind: "showDocumentLockAccessRequestSnackbar",
      message,
      duration: null,
      action: "DOCUMENT_LOCK_ACCESS_REQUEST",
      scope,
    }),
  ),
  showDocumentLockExtendNudgeSnackbar: vi.fn((message, scope = {}) =>
    record({
      kind: "showDocumentLockExtendNudgeSnackbar",
      message,
      severity: "warning",
      duration: null,
      action: "DOCUMENT_LOCK_EXTEND_NUDGE",
      scope,
    }),
  ),
};

/**
 * The module body for `vi.mock("…/Events/snackbarEvents")`.
 *
 * `vi.mock` is hoisted above imports, so the factory imports this itself:
 *
 * ```js
 * vi.mock("../../Events/snackbarEvents", async () => {
 *   const { snackbarMock } = await import("../../tests/snackbarHarness.js");
 *   return snackbarMock();
 * });
 * ```
 *
 * @returns {Object} every export of the real module, spied and recording.
 */
export function snackbarMock() {
  return { ...snackbarSpies };
}

/**
 * Clears the record and the spies. Call it in a `beforeEach`: both are module
 * state, so without it one test reads what an earlier one raised.
 */
export function resetSnackbars() {
  snackbars.length = 0;
  for (const spy of Object.values(snackbarSpies)) spy.mockClear();
}

/**
 * The most recent snackbar, or null when nothing was raised.
 *
 * @param {string} [kind] - Narrow to one export, e.g. `"showSnackbarError"`.
 */
export function lastSnackbar(kind) {
  const of = kind ? snackbars.filter((s) => s.kind === kind) : snackbars;
  return of.at(-1) ?? null;
}

/**
 * What the reader was told, in order — the messages alone.
 *
 * @param {string} [severity] - Narrow to one severity, e.g. `"error"`.
 * @returns {string[]}
 */
export function snackbarMessages(severity) {
  const of = severity
    ? snackbars.filter((s) => s.severity === severity)
    : snackbars;
  return of.map((s) => s.message);
}
