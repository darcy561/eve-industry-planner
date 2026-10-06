import { alpha } from "@mui/material/styles";

import { getJobTypeAccentColour } from "../../Functions/Helper/jobTypeDividerColour";
import {
  BLUEPRINT_JOB_STATE,
  blueprintJobState,
} from "../../Functions/Blueprints/blueprintJobState";

/**
 * The colour a blueprint card is edged in, which says at a glance what is happening to it.
 *
 * Idle, it is the colour the rest of the app gives that kind of industry — manufacturing,
 * reaction, invention — so a library page reads as the mix of work it holds rather than as one
 * blue. A copy is the same colour softened, since the card's artwork already says which it is.
 *
 * A job running on it overrides that: the card is reporting a state the player can act on, and
 * that outranks saying what kind of job it would be. A copy whose remaining runs the job will use
 * up is marked as expiring rather than merely in use, because it will not survive the job.
 *
 * @param {Object|null} esiJob - the active job on this blueprint, if there is one
 * @param {boolean} isCopy
 * @param {number} runs
 * @param {number} [jobType] - a `jobTypes` value; see {@link getJobTypeAccentColour}
 * @returns {(theme: import("@mui/material/styles").Theme) => string}
 */
export function blueprintAccentColour(esiJob, isCopy, runs, jobType) {
  if (!esiJob) {
    return (theme) => {
      const accent = getJobTypeAccentColour(theme, jobType);
      return isCopy ? alpha(accent, 0.55) : accent;
    };
  }

  return blueprintJobState({ isCopy, runs }, esiJob) ===
    BLUEPRINT_JOB_STATE.RUNS_OUT
    ? (theme) => theme.palette.error.main
    : (theme) => theme.palette.warning.main;
}
