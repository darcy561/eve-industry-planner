import { Tooltip } from "@mui/material";

/**
 * The tooltip saying another session holds a lock, finished with what that stops.
 *
 * @param {Object} options
 * @param {"job" | "group"} [options.scope] - Which lock to name; the job's when omitted
 * @param {string} options.action - What is stopped, with its own verb, e.g. "save is disabled"
 * @returns {string}
 */
export function lockReasonText({ scope = "job", action }) {
  return `Another session holds the edit lock on this ${scope} — ${action}.`;
}

/**
 * Why the Edit Job page cannot save or change the job right now: another session holds its lock, or
 * this tab has not been granted it yet.
 *
 * @param {object} o
 * @param {boolean} o.readOnly
 * @param {boolean} o.jobLockHeld
 * @param {string} o.action - e.g. `"save is disabled"`
 * @returns {string}
 */
export function persistAffordanceBlockedReason({
  readOnly,
  jobLockHeld,
  action,
}) {
  if (readOnly) return lockReasonText({ action });
  if (!jobLockHeld) {
    return "Waiting for the edit lock on this job — try again in a moment.";
  }
  return "";
}

/**
 * Span+tooltip wrapper for a disabled MUI interactive child.
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
