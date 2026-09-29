import { reprocessingItemTypes } from "../../Context/defaultValues";

/**
 * The reprocessing yield for ore, moon ore and ice, combining the base yield with
 * the rig, structure, skill and implant modifiers.
 *
 * @param {number} [rigMod=0] - Rig modifier bonus
 * @param {number} [rigSecurity=1] - The fitted rig's multiplier for this security band
 * @param {number} [strucMod=0] - Structure modifier bonus
 * @param {number} [reproLvl=0] - Reprocessing skill level
 * @param {number} [reEffLvl=0] - Reprocessing Efficiency skill level
 * @param {number} [oreLvl=0] - Ore-specific skill level
 * @param {number} [implantMod=0] - Implant modifier bonus
 * @returns {number} Calculated reprocessing yield percentage
 */
function oreMoonAndIceReprocessingFormula(
  rigMod = 0,
  rigSecurity = 1,
  strucMod = 0,
  reproLvl = 0,
  reEffLvl = 0,
  oreLvl = 0,
  implantMod = 0,
) {
  const baseYield = 50 + rigMod;

  const multipliers = [
    rigMod > 0 ? rigSecurity : 1,
    1 + strucMod,
    1 + reproLvl * 0.03,
    1 + reEffLvl * 0.02,
    1 + oreLvl * 0.02,
    1 + implantMod,
  ];
  return baseYield * multipliers.reduce((acc, mod) => acc * mod, 1);
}

/**
 * The reprocessing yield for scrap metal, from the Scrap Metal Reprocessing skill.
 *
 * @param {number} [scrapSkillLvl=0] - Scrap Metal Reprocessing skill level
 * @returns {number} Calculated reprocessing yield percentage
 */
function scrapMetalReprocessingFormula(scrapSkillLvl = 0) {
  return 50 * (1 + scrapSkillLvl * 0.02);
}

/**
 * The gas decompression yield, from the structure and the Gas Cloud Harvesting
 * skill.
 *
 * @param {number} [strucMod=0] - Structure modifier bonus
 * @param {number} [gasSkillLvl=0] - Gas Cloud Harvesting skill level
 * @returns {number} Calculated gas decompression yield percentage
 */
function gasDecompressionFormula(strucMod = 0, gasSkillLvl = 0) {
  const multipliers = [strucMod, gasSkillLvl * 1];
  return 80 + multipliers.reduce((acc, mod) => acc + mod, 0);
}

/**
 * The reprocessing yield for one item type, routed to the formula that item type
 * uses.
 *
 * @param {string} itemType - Type of item being reprocessed
 * @param {number} rig - Rig modifier bonus
 * @param {number} rigSecurity - The fitted rig's multiplier for this security band
 * @param {number} struct - Structure modifier bonus
 * @param {number} rlvl - Reprocessing skill level
 * @param {number} relvl - Reprocessing Efficiency skill level
 * @param {number} typelvl - Item-specific skill level
 * @param {number} implant - Implant modifier bonus
 * @returns {number} Calculated reprocessing yield percentage
 */
function reprocessFromItemType(
  itemType,
  rig,
  rigSecurity,
  struct,
  rlvl,
  relvl,
  typelvl,
  implant,
) {
  switch (itemType) {
    case reprocessingItemTypes.ore:
    case reprocessingItemTypes.unrefinedOre:
    case reprocessingItemTypes.moonOre:
    case reprocessingItemTypes.ice:
      return oreMoonAndIceReprocessingFormula(
        rig,
        rigSecurity,
        struct,
        rlvl,
        relvl,
        typelvl,
        implant,
      );
    case reprocessingItemTypes.scrap:
      return scrapMetalReprocessingFormula(typelvl);
    case reprocessingItemTypes.gas:
      return gasDecompressionFormula(struct, typelvl);
    default:
      return 0;
  }
}

export {
  reprocessFromItemType,
  oreMoonAndIceReprocessingFormula,
  scrapMetalReprocessingFormula,
  gasDecompressionFormula,
};
