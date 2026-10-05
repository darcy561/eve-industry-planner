import { NOTHING_AT_PATH, valueAtPath } from "../Helper/valueAtPath.js";

/**
 * The body for a write covering the given log entries.
 *
 * @param {object} document - The job as it now reads
 * @param {Array<{patches: Array<{op: string, path: Array<string|number>}>}>} entries
 * @returns {{document: object, removed: object}}
 */
export function writeBody(document, entries) {
  const { changed, gone } = sort(entries);

  const cleared = [];
  for (const path of shortest(gone)) {
    if (Array.isArray(valueAtPath(document, path.slice(0, -1)))) {
      changed.push(path.slice(0, -1));
      continue;
    }
    cleared.push(path);
  }

  const partial = {};
  const written = [];
  for (const path of shortest(changed)) {
    const value = valueAtPath(document, path);
    if (value === NOTHING_AT_PATH) continue;
    place(partial, path, value);
    written.push(path);
  }

  return { document: partial, removed: removals(document, cleared, written) };
}

/**
 * The log's patches split into the paths a write sets and the paths it clears.
 *
 * @param {Array<object>} entries
 * @returns {{changed: Array<Array<string|number>>, gone: Array<Array<string|number>>}}
 */
function sort(entries) {
  const changed = [];
  const gone = [];
  for (const entry of entries ?? []) {
    for (const patch of entry?.patches ?? []) {
      if (!Array.isArray(patch?.path) || patch.path.length === 0) continue;
      if (patch.op !== "remove") {
        changed.push([...patch.path]);
        continue;
      }
      if (patch.path.length === 1) {
        throw new Error(
          `a job's ${patch.path[0]} cannot be removed from the job`,
        );
      }
      gone.push([...patch.path]);
    }
  }
  return { changed, gone };
}

/**
 * The rows that went, as paths into the job.
 *
 * @param {object} document
 * @param {Array<Array<string|number>>} cleared - Removal paths, shortest already applied
 * @param {Array<Array<string|number>>} written - The paths the partial document carries. A path the
 *     job changed and then dropped is not among them, so the row it named is still reported removed
 * @returns {Array<Array<string>>}
 */
function removals(document, cleared, written) {
  const paths = [];
  for (const path of cleared) {
    if (valueAtPath(document, path) !== NOTHING_AT_PATH) continue;
    if (written.some((other) => covers(other, path))) continue;

    paths.push(path.map(String));
  }
  return paths;
}

/**
 * Drops any path another path already covers, so a collection being sent whole does not also send
 * its rows.
 *
 * @param {Array<Array<string|number>>} paths
 * @returns {Array<Array<string|number>>}
 */
function shortest(paths) {
  const kept = [];
  for (const path of paths) {
    if (kept.some((other) => covers(other, path))) continue;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (covers(path, kept[i])) kept.splice(i, 1);
    }
    kept.push(path);
  }
  return kept;
}

/**
 * @param {Array<string|number>} outer
 * @param {Array<string|number>} inner
 * @returns {boolean} Whether writing `outer` also writes `inner`
 */
function covers(outer, inner) {
  if (outer.length > inner.length) return false;
  return outer.every((step, index) => String(step) === String(inner[index]));
}

/**
 * @param {object} partial
 * @param {Array<string|number>} path
 * @param {*} value
 */
function place(partial, path, value) {
  let held = partial;
  for (const step of path.slice(0, -1)) {
    if (held[step] === undefined) held[step] = {};
    held = held[step];
  }
  held[path.at(-1)] = value;
}
