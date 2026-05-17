import { Tooltip } from "@mui/material";

/**
 * Build a uniform "another session holds the lock" tooltip string.
 *
 * The Edit-Job leaves have historically inlined slightly different wordings
 * for each affordance ("archiving is disabled", "linking market orders is
 * disabled", "sibling-job links can't change", …). Centralising them here
 * keeps the prefix consistent and lets a future copy change happen in one
 * spot.
 *
 * @param {Object} options
 * @param {"job" | "group"} [options.scope]
 *   Which lock to mention in the prefix. Defaults to `"job"`.
 * @param {string} options.action
 *   The action clause, complete with its own verb ("archiving is disabled",
 *   "manual transactions are disabled", "sibling-job links can't change",
 *   etc.). Plural/singular agreement therefore lives on the caller side.
 * @returns {string}
 */
export function lockReasonText({ scope = "job", action }) {
  return `Another session holds the edit lock on this ${scope} — ${action}.`;
}

/**
 * Tooltip when save/delete (or similar) is blocked by lock state on edit-job.
 * Covers viewer/read-only (another session) and vacancy (#21: not holding the lease yet).
 *
 * @param {object} o
 * @param {boolean} o.readOnly
 * @param {boolean} o.jobReadOnly
 * @param {boolean} o.groupReadOnly
 * @param {boolean} o.jobLockHeld
 * @param {boolean} o.groupLockHeld
 * @param {boolean} o.hasGroup
 * @param {string} o.action — e.g. `"save is disabled"` / `"delete is disabled"`
 */
export function persistAffordanceBlockedReason({
  readOnly,
  jobReadOnly,
  groupReadOnly,
  jobLockHeld,
  groupLockHeld,
  hasGroup,
  action,
}) {
  if (readOnly) {
    if (groupReadOnly) {
      return lockReasonText({ scope: "group", action });
    }
    return lockReasonText({ action });
  }
  if (!jobLockHeld) {
    return "Waiting for the edit lock on this job — try again in a moment.";
  }
  if (hasGroup && !groupLockHeld) {
    return lockReasonText({ scope: "group", action });
  }
  return "";
}

/**
 * Span+tooltip wrapper for a disabled MUI interactive child.
 *
 * - When `readOnly` is `false` the children render unwrapped (zero overhead
 *   for the common path).
 * - When `readOnly` is `true` the children are wrapped in `<span>` so the
 *   surrounding `<Tooltip>` can attach its hover listeners to a non-disabled
 *   element (MUI requires this when the underlying button is `disabled`).
 *
 * Mirrors the inline `{jobLockReadOnly ? <Tooltip>…</Tooltip> : button}`
 * pattern that the Complete-stage buttons established; consolidating the
 * spelling here keeps every leaf's tree identical.
 *
 * @param {{ readOnly: boolean, reason: string, children: React.ReactNode }} props
 */
export function LockGatedTooltip({ readOnly, reason, children }) {
  if (!readOnly) return children;
  return (
    <Tooltip arrow title={reason}>
      <span>{children}</span>
    </Tooltip>
  );
}
