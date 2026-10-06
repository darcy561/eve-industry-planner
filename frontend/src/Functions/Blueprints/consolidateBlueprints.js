import { OWNER_KIND } from "../Shared/ownerKind";
import { activeJobsByBlueprint } from "./blueprintJobState";

/**
 * @typedef {Object} BlueprintStack
 * @property {string} key - stable across a refetch, so a card does not jump
 * @property {Array<import("./buildBlueprintRows").BlueprintRow>} blueprints
 * @property {import("./buildBlueprintRows").BlueprintRow} blueprint - the one the card is drawn from
 * @property {Object|null} esiJob - the active job running on it, when it has one
 */

/**
 * Blueprints gathered into the cards a library panel shows.
 *
 * Interchangeable blueprints are one card: the same type, held by the same owner, with the same
 * research, the same runs remaining, and original or copy alike. A shelf of twenty identical copies
 * is one thing the player owns twenty of, not twenty things.
 *
 * A blueprint with a job running on it is not interchangeable with anything — it is unavailable
 * until the job finishes, and the job's own figures belong to that one blueprint — so it leaves the
 * stack and stands alone.
 *
 * @param {Array<import("./buildBlueprintRows").BlueprintRow>} [blueprints]
 * @param {Array<Object>} [esiJobs] - industry jobs covering this blueprint type
 * @returns {BlueprintStack[]}
 */
export default function consolidateBlueprints(blueprints = [], esiJobs = []) {
  const activeByItemId = activeJobsByBlueprint(esiJobs);

  const byKey = new Map();

  for (const blueprint of blueprints) {
    if (!blueprint) continue;

    const esiJob = activeByItemId.get(blueprint.itemId) ?? null;
    const key = esiJob ? `job-${blueprint.itemId}` : stackKey(blueprint);

    const held = byKey.get(key);
    if (held) {
      held.blueprints.push(blueprint);
    } else {
      byKey.set(key, { key, blueprints: [blueprint], blueprint, esiJob });
    }
  }

  return [...byKey.values()];
}

/**
 * What makes two blueprints the same shelf.
 *
 * @param {import("./buildBlueprintRows").BlueprintRow} blueprint
 * @returns {string}
 */
function stackKey(blueprint) {
  return [
    blueprint.typeId,
    blueprint.ownerType === OWNER_KIND.CORPORATION ? "corp" : "char",
    blueprint.ownerId ?? "",
    blueprint.isCopy ? "copy" : "original",
    blueprint.me ?? 0,
    blueprint.te ?? 0,
    blueprint.runs ?? -1,
    blueprint.quantity ?? 0,
  ].join("-");
}

/**
 * How many usable blueprints a card stands for.
 *
 * Counting rows undercounts: an untouched original arrives from the market as one row carrying a
 * quantity, and each of those can take its own job.
 *
 * @param {BlueprintStack} stack
 * @returns {number}
 */
export function stackCount(stack) {
  return stack.blueprints.reduce(
    (total, blueprint) =>
      total + (blueprint.isCopy ? 1 : Math.max(blueprint.originalCount, 1)),
    0,
  );
}
