import { applyPatches } from "immer";
import { sameValue } from "../../../Functions/Helper/sameValue.js";
import {
  NOTHING_AT_PATH,
  valueAtPath,
} from "../../../Functions/Helper/valueAtPath.js";

/**
 * How one of the reader's changes stands against a new copy of the job: it still applies, the copy
 * already holds it, the copy set the same place differently, or what it changed is gone.
 *
 * @typedef {"clean"|"done"|"conflict"|"gone"} ReviewOutcome
 */

/**
 * @typedef {object} ReviewedChange
 * @property {import("./jobDraftStore.js").DraftEntry} entry
 * @property {ReviewOutcome} outcome
 * @property {number} [follows] - The held change this one depends on, which it stands or falls with
 * @property {Array<{path: Array<string|number>, mine: *}>} changes - Each place it set, and the value
 *     the reader gave it, `undefined` where they removed it
 * @property {Array<Restore>} [restore] - For a held change, what puts the reader's version back on
 *     screen over the new copy
 */

/**
 * @typedef {object} Restore
 * @property {Array<string|number>} path - The shallowest place the new copy lacks, or the change's own
 * @property {*} value - What the reader had there
 * @property {boolean} removed - Whether the reader had nothing there
 */

/**
 * @param {*} document @param {Array<string|number>} path
 */
function parentResolves(document, path) {
  const parent = valueAtPath(document, path.slice(0, -1));
  return parent !== null && typeof parent === "object";
}

/**
 * @param {Array<string|number>} a @param {Array<string|number>} b
 */
function overlaps(a, b) {
  const shorter = Math.min(a.length, b.length);
  return a
    .slice(0, shorter)
    .every((step, index) => String(step) === String(b[index]));
}

/**
 * @param {*} document
 * @param {Array<object>} patches
 * @returns {*} The patched document, or `NOTHING_AT_PATH` where the patches do not apply
 */
function applied(document, patches) {
  try {
    return applyPatches(document, patches);
  } catch {
    return NOTHING_AT_PATH;
  }
}

/**
 * What puts the reader's version of a held change back over the new copy: the change's own places,
 * or where the copy removed a parent, that parent as the reader had it.
 *
 * @param {*} working - The new copy with the changes that still apply
 * @param {*} mine - The reader's job just after this change
 * @param {Array<Array<string|number>>} paths
 * @returns {Array<Restore>}
 */
function restoreFor(working, mine, paths) {
  const restore = [];
  for (const path of paths) {
    let at = path.length;
    for (let depth = 1; depth < path.length; depth += 1) {
      if (valueAtPath(working, path.slice(0, depth)) === NOTHING_AT_PATH) {
        at = depth;
        break;
      }
    }
    const place = path.slice(0, at);
    if (
      restore.some(
        (held) =>
          overlaps(held.path, place) && held.path.length <= place.length,
      )
    ) {
      continue;
    }
    const value =
      mine === NOTHING_AT_PATH ? NOTHING_AT_PATH : valueAtPath(mine, place);
    restore.push({
      path: place,
      value: shown(value),
      removed: value === NOTHING_AT_PATH,
    });
  }
  return restore;
}

/**
 * Lays each restore over a document, so a held change reads as the reader made it.
 *
 * @param {object} document
 * @param {Array<Restore>} restore
 * @returns {object}
 */
export function restoreOver(document, restore) {
  return applyPatches(
    document,
    restore.map(({ path, value, removed }) =>
      removed ? { op: "remove", path } : { op: "add", path, value },
    ),
  );
}

/**
 * The value a document holds at a path, or `undefined` where the path leads nowhere.
 *
 * @param {*} document
 * @param {Array<string|number>} path
 * @returns {*}
 */
export function readAt(document, path) {
  return shown(valueAtPath(document, path));
}

/**
 * @param {*} value
 */
function shown(value) {
  return value === NOTHING_AT_PATH ? undefined : value;
}

/**
 * Sorts the reader's changes to one job against the copy that replaces the one they were made on,
 * oldest first, so each later change is judged on top of the earlier ones that still apply.
 *
 * @param {object} before - The job the changes were made against
 * @param {object} after - The job as it now stands
 * @param {Array<import("./jobDraftStore.js").DraftEntry>} entries - Oldest first
 * @returns {Array<ReviewedChange>}
 */
export function reviewChanges(before, after, entries) {
  let committed = before;
  let working = after;
  const held = [];
  const reviewed = [];

  for (const entry of entries) {
    const next = applied(committed, entry.patches);
    const paths = entry.patches.map((patch) => patch.path);
    const changes = paths.map((path) => ({
      path,
      mine: shown(valueAtPath(next, path)),
    }));
    if (next !== NOTHING_AT_PATH) committed = next;

    const leader = held.find((holding) =>
      holding.entry.patches.some((patch) =>
        paths.some((path) => overlaps(patch.path, path)),
      ),
    );
    if (leader) {
      const follower = {
        entry,
        outcome: leader.outcome,
        follows: leader.follows ?? leader.entry.seq,
        changes,
        restore: restoreFor(working, next, paths),
      };
      held.push(follower);
      reviewed.push(follower);
      continue;
    }

    let outcome;
    if (
      next !== NOTHING_AT_PATH &&
      paths.every((path) =>
        sameValue(valueAtPath(after, path), valueAtPath(next, path)),
      )
    ) {
      outcome = "done";
    } else if (!paths.every((path) => parentResolves(working, path))) {
      outcome = "gone";
    } else if (
      paths.every((path) =>
        sameValue(valueAtPath(before, path), valueAtPath(after, path)),
      ) &&
      applied(working, entry.patches) !== NOTHING_AT_PATH
    ) {
      outcome = "clean";
      working = applyPatches(working, entry.patches);
    } else {
      outcome = "conflict";
    }

    const result = { entry, outcome, changes };
    if (outcome === "conflict" || outcome === "gone") {
      result.restore = restoreFor(working, next, paths);
      held.push(result);
    }
    reviewed.push(result);
  }
  return reviewed;
}
