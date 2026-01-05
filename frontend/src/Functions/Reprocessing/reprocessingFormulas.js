import { reprocessingItemTypes } from "../../Context/defaultValues";

/**
 * Calculates reprocessing yield for ore, moon ore, and ice based on various modifiers.
 * Uses a multiplicative formula that combines base yield with multiple bonus modifiers.
 * 
 * @param {number} [rigMod=0] - Rig modifier bonus
 * @param {number} [sysMod=0] - System modifier bonus
 * @param {number} [strucMod=0] - Structure modifier bonus
 * @param {number} [reproLvl=0] - Reprocessing skill level
 * @param {number} [reEffLvl=0] - Reprocessing Efficiency skill level
 * @param {number} [oreLvl=0] - Ore-specific skill level
 * @param {number} [implantMod=0] - Implant modifier bonus
 * @returns {number} Calculated reprocessing yield percentage
 * 
 * @example
 * const yield = oreMoonAndIceReprocessingFormula(5, 0.1, 0.2, 5, 4, 3, 0.05);
 * console.log(yield); // Calculated yield percentage
 */
function oreMoonAndIceReprocessingFormula(
  rigMod = 0,
  sysMod = 0,
  strucMod = 0,
  reproLvl = 0,
  reEffLvl = 0,
  oreLvl = 0,
  implantMod = 0
) {
  const baseYield = 50 + rigMod;

  const multipliers = [
    rigMod > 0 ? 1 + sysMod : 1,
    1 + strucMod,
    1 + reproLvl * 0.03,
    1 + reEffLvl * 0.02,
    1 + oreLvl * 0.02,
    1 + implantMod,
  ];
  return baseYield * multipliers.reduce((acc, mod) => acc * mod, 1);
}

/**
 * Calculates reprocessing yield for scrap metal based on skill level.
 * Uses a simple additive formula with skill-based bonus.
 * 
 * @param {number} [scrapSkillLvl=0] - Scrap Metal Reprocessing skill level
 * @returns {number} Calculated reprocessing yield percentage
 * 
 * @example
 * const yield = scrapMetalReprocessingFormula(5);
 * console.log(yield); // 60% yield
 */
function scrapMetalReprocessingFormula(scrapSkillLvl = 0) {
  return 50 * (1 + scrapSkillLvl * 0.02);
}

/**
 * Calculates gas decompression yield based on structure and skill modifiers.
 * Uses an additive formula combining base yield with structure and skill bonuses.
 * 
 * @param {number} [strucMod=0] - Structure modifier bonus
 * @param {number} [gasSkillLvl=0] - Gas Cloud Harvesting skill level
 * @returns {number} Calculated gas decompression yield percentage
 * 
 * @example
 * const yield = gasDecompressionFormula(0.1, 5);
 * console.log(yield); // 95% yield
 */
function gasDecompressionFormula(strucMod = 0, gasSkillLvl = 0) {
    const multipliers = [strucMod,  gasSkillLvl * 1];
  return 80 + multipliers.reduce((acc, mod) => acc + mod, 0);
}

/**
 * Determines the appropriate reprocessing formula based on item type.
 * Routes to the correct calculation function based on the type of material being processed.
 * 
 * @param {string} itemType - Type of item being reprocessed
 * @param {number} rig - Rig modifier bonus
 * @param {number} sys - System modifier bonus
 * @param {number} struct - Structure modifier bonus
 * @param {number} rlvl - Reprocessing skill level
 * @param {number} relvl - Reprocessing Efficiency skill level
 * @param {number} typelvl - Item-specific skill level
 * @param {number} implant - Implant modifier bonus
 * @returns {number} Calculated reprocessing yield percentage
 * 
 * @example
 * const yield = reprocessFromItemType('ore', 5, 0.1, 0.2, 5, 4, 3, 0.05);
 * console.log(yield); // Calculated yield for ore
 */
function reprocessFromItemType(
  itemType,
  rig,
  sys,
  struct,
  rlvl,
  relvl,
  typelvl,
  implant
) {
  switch (itemType) {
    case reprocessingItemTypes.ore:
    case reprocessingItemTypes.unrefinedOre:
    case reprocessingItemTypes.moonOre:
    case reprocessingItemTypes.ice:
      return oreMoonAndIceReprocessingFormula(
        rig,
        sys,
        struct,
        rlvl,
        relvl,
        typelvl,
        implant
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
