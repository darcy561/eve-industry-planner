import { readIndustryBonusCatalogue } from "../Static/industryBonuses";
import { itemRecord } from "../Static/items";

/**
 * The published bonus catalogue as it stands, for a calculation that cannot wait
 * on a hook.
 *
 * @returns {Object|null}
 */
export function readIndustryBonuses() {
  return readIndustryBonusCatalogue();
}

/**
 * What an item is, as far as a bonus is concerned: the group and category a
 * family may name it by.
 *
 * @param {number} [typeID]
 * @returns {{groupID: number, categoryID: number, factionID: number}|null}
 */
export function readItemFamilyFacts(typeID) {
  if (!typeID) return null;

  const record = itemRecord(typeID);
  if (!record) return null;

  return {
    groupID: record.group_id,
    categoryID: record.category_id,
    factionID: record.faction_id,
  };
}

/**
 * Whether an item belongs to one of the families the game scopes a bonus by.
 *
 * @param {{groupID?: number, categoryID?: number}} item - What is being built
 * @param {{categoryIDs?: Array<number>, groupIDs?: Array<number>}} family
 * @returns {boolean}
 */
export function itemInFamily(item, family) {
  if (!item || !family) return false;

  return (
    (family.groupIDs ?? []).includes(item.groupID) ||
    (family.categoryIDs ?? []).includes(item.categoryID)
  );
}

/**
 * Whether one bonus reaches the item being built: every item when it names no
 * family, and otherwise only the items in the family it names.
 *
 * @param {{familyID?: number}} bonus - One published bonus
 * @param {Object} item - What is being built
 * @param {Object} families - The published families, keyed by id
 * @returns {boolean}
 */
export function bonusReachesItem(bonus, item, families) {
  if (!bonus) return false;
  if (!bonus.familyID) return true;

  return itemInFamily(item, families?.[bonus.familyID]);
}

/**
 * The best figure a source gives on one axis for the item being built, as a
 * percentage, or zero where none of its bonuses reach that item.
 *
 * @param {{bonuses?: Array<Object>}} source - A published rig or structure
 * @param {string} activity - The kind of job, as the game names it
 * @param {string} axis - material, time or cost
 * @param {Object} item - What is being built
 * @param {Object} families - The published families, keyed by id
 * @returns {number}
 */
export function sourceBonusFor(source, activity, axis, item, families) {
  let best = 0;

  for (const bonus of source?.bonuses ?? []) {
    if (bonus.activity !== activity || bonus.axis !== axis) continue;
    if (!bonusReachesItem(bonus, item, families)) continue;
    best = Math.max(best, bonus.value ?? 0);
  }
  return best;
}

/**
 * The rigs of one kind that fit a structure of this size, in name order, which
 * puts every tier of one rig together because a tier is the end of its name.
 *
 * @param {Object} catalogue - The published bonus catalogue
 * @param {string} activity - The kind of job, as the game names it
 * @param {number} size - The rig size the structure takes
 * @returns {Array<Object>}
 */
export function rigsFittingSize(catalogue, activity, size) {
  return Object.values(catalogue?.sources ?? {})
    .filter((source) => source.kind === "rig" && source.size === size)
    .filter((source) =>
      (source.bonuses ?? []).some((bonus) => bonus.activity === activity),
    )
    .sort((one, other) => one.label.localeCompare(other.label));
}

/**
 * The families a rig helps, named, so an option can say what it is for.
 *
 * @param {Object} rig - A published rig
 * @param {Object} families - The published families, keyed by id
 * @returns {string}
 */
export function familiesHelpedBy(rig, families) {
  const named = new Set(
    (rig?.bonuses ?? [])
      .map((bonus) => families?.[bonus.familyID]?.name)
      .filter(Boolean),
  );
  if (named.size === 0) return "Every item";

  return [...named].sort().join(", ");
}

/**
 * What a rig field offers: no rig, the rig already fitted where it would not be
 * offered, and every published rig that fits the structure's size.
 *
 * @param {Object} catalogue - The published bonus catalogue
 * @param {string} activity - The kind of job, as the game names it
 * @param {number} [size] - The rig size the structure takes
 * @param {Object|null} [fitted] - The rig fitted now
 * @returns {Array<{id: number, label: string, helps: string}>}
 */
export function rigOptionsFor(catalogue, activity, size, fitted = null) {
  const offered = (size ? rigsFittingSize(catalogue, activity, size) : []).map(
    (rig) => ({
      id: rig.id,
      label: rig.label,
      helps: familiesHelpedBy(rig, catalogue?.families),
    }),
  );

  const none = { id: 0, label: "None", helps: "" };
  if (!fitted || fitted.id === 0) return [none, ...offered];

  const alreadyOffered = offered.some((option) => option.id === fitted.id);
  if (alreadyOffered) return [none, ...offered];

  return [
    none,
    { id: fitted.id, label: fitted.label, helps: "Fitted" },
    ...offered,
  ];
}
