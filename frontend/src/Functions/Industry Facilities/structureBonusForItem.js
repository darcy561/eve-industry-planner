import { jobTypeMapping } from "../../Context/defaultValues";
import {
  itemInFamily,
  readIndustryBonuses,
  readItemFamilyFacts,
  sourceBonusFor,
} from "./industryBonuses";

/**
 * Whether a structure's own declared scope reaches the item being built.
 *
 * @param {{factions?: Array<number>, exceptFamilies?: Array<number>}} scope
 * @param {{factionID?: number, groupID?: number, categoryID?: number}|null} item
 * @param {Object} families - The published families, keyed by id
 * @returns {boolean}
 * @private
 */
function scopeReachesItem(scope, item, families) {
  if (!item) return false;
  if (scope.factions && !scope.factions.includes(item.factionID)) return false;

  return !(scope.exceptFamilies ?? []).some((familyID) =>
    itemInFamily(item, families?.[familyID]),
  );
}

/**
 * What a structure gives on one axis for the item being built: its published
 * figure, its declared scope's figure, or its own flat figure.
 *
 * @param {Object|null} structure - The structure the job runs in
 * @param {number} jobType - The kind of job
 * @param {string} axis - material, time or cost
 * @param {number} [itemID] - What the job builds
 * @returns {number}
 */
export function structureBonusForItem(structure, jobType, axis, itemID) {
  if (!structure) return 0;

  const catalogue = readIndustryBonuses();
  const published = catalogue?.sources?.[structure.publishedID];

  if (published) {
    return sourceBonusFor(
      published,
      jobTypeMapping[jobType],
      axis,
      readItemFamilyFacts(itemID),
      catalogue.families,
    );
  }

  if (structure.appliesTo) {
    const item = readItemFamilyFacts(itemID);
    if (!scopeReachesItem(structure.appliesTo, item, catalogue?.families)) {
      return 0;
    }
  }
  return structure[axis] ?? 0;
}
