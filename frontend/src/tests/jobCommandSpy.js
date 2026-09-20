import { produce } from "immer";
import { vi } from "vitest";

/**
 * Stands in for the edit session's actions, recording the commands a control
 * runs instead of changing a job.
 *
 * A control is asked what the reader did, not what fields moved, so a test
 * presses the control and then reads the commands back — by name for which step
 * it was, and by {@link appliedTo} for what it does to a job.
 *
 * @param {Object} [extra] - Further actions the component under test calls
 * @returns {Object}
 */
export function commandActions(extra = {}) {
  return { run: vi.fn(), askAbout: vi.fn(), ...extra };
}

/**
 * The commands run so far, oldest first.
 *
 * @param {Object} actions - From {@link commandActions}
 * @returns {Array<{name: string, recipe: Function}>}
 */
export function commandsRun(actions) {
  return actions.run.mock.calls.map(([command]) => command);
}

/**
 * Whether a command leaves a job exactly as it found it.
 *
 * A command that changes nothing records nothing when it is really run, so this
 * is how a test says a refresh found nothing new.
 *
 * @param {{recipe: Function}} command
 * @param {object} document
 * @returns {boolean}
 */
export function unchangedBy(command, document) {
  return produce(document, command.recipe) === document;
}

/**
 * The job that comes out of running what was recorded over a document.
 *
 * @param {Object} actions - From {@link commandActions}
 * @param {object} document - The job as plain data
 * @returns {object}
 */
export function appliedTo(actions, document) {
  return commandsRun(actions).reduce(
    (job, command) => produce(job, command.recipe),
    document,
  );
}
