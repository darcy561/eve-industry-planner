import { jobTypes, reprocessingItemTypes } from "../Context/defaultValues";
import {
  getImplantFromID,
  getSystemTypeFromID,
} from "../Functions/Helper/getStructureInfo";
import { reprocessFromItemType } from "../Functions/Reprocessing/reprocessingFormulas";
import {
  rigBonusFor,
  structureBonusFor,
} from "../Functions/Reprocessing/structureBonuses";
import { structureFromDocument } from "../Functions/Structure/customStructure";

const reprocessingSkillTypeID = 3385;
const reprocessingEffSkillTypeID = 3389;

/**
 * ReprocessingItem class for EVE Online reprocessing calculations and management.
 *
 * @class ReprocessingItem
 * @example
 * // Create a new reprocessing item
 * const ore = new ReprocessingItem({
 * id: 12345,
 * name: 'Veldspar',
 * materials: { 34: 100 },
 * batchSize: 100,
 * itemType: reprocessingItemTypes.ore,
 * reprocessingSkill: 12196
 * });
 *
 * @example
 * // Add quantity and reprocess materials
 * ore.addToTotalQuantity(1000);
 * ore.reprocessMaterials(skillsMap, reprocessingStructure);
 * console.log('Yield:', ore.percentageYield);
 * console.log('Output:', ore.reprocessedMaterials);
 *
 * @example
 * // Calculate reprocessable quantity
 * ore.setTotalQuantity(1500);
 * console.log('Reprocessable:', ore.reprocessableQuantity);
 * console.log('Remaining:', ore.remainingQuantity);
 */
class ReprocessingItem {
  /**
   * Creates a new ReprocessingItem instance.
   *
   * @param {Object} ore - Ore/item data object
   * @param {number} ore.id - Item ID
   * @param {string} ore.name - Item name
   * @param {Object} ore.materials - Materials output object (typeID: quantity)
   * @param {number} ore.batchSize - Batch size for reprocessing
   * @param {number} ore.itemType - Item type (ore, gas, ice, moon ore)
   * @param {number} ore.reprocessingSkill - Required reprocessing skill type ID
   */
  constructor(ore) {
    this.id = ore.id;
    this.name = ore.name;
    this.materials = { ...ore.materials };
    this.reprocessedMaterials = { ...ore.materials };
    this.batchSize = ore.batchSize;
    this.itemType = ore.itemType;
    this.reprocessingSkill = ore.reprocessingSkill;
    this.totalQuantity = 0;
    this.percentageYield = 50;
    this.unitPrice = 0;
  }

  /**
   * @param {number} inputNumber - Quantity to add
   */
  addToTotalQuantity(inputNumber) {
    this.totalQuantity += inputNumber;
  }

  /**
   * @param {number} inputNumber - Total quantity to set
   */
  setTotalQuantity(inputNumber) {
    this.totalQuantity = inputNumber;
  }

  /**
   * How much of what is held can go through the reprocessing plant: whole
   * batches only.
   *
   * @returns {number}
   */
  get reprocessableQuantity() {
    return Math.floor(this.totalQuantity / this.batchSize) * this.batchSize;
  }

  /**
   * What is left over once the whole batches are taken out.
   *
   * @returns {number}
   */
  get remainingQuantity() {
    return this.totalQuantity % this.batchSize;
  }

  /**
   * How many batches will be reprocessed.
   *
   * @returns {number}
   */
  get batchCount() {
    return Math.floor(this.totalQuantity / this.batchSize);
  }

  /**
   * Reprocesses materials based on skills and structure bonuses.
   *
   * @param {Object} [reprocessingSkillsMap={}] - Map of skill type IDs to levels
   * @param {Object} [reprocessingStructure] - Structure configuration; an NPC station when absent
   *
   * @example
   * // Reprocess with skills and structure
   * ore.reprocessMaterials({
   * 3385: 5,  // Reprocessing V
   * 3389: 4,  // Reprocessing Efficiency IV
   * 12196: 3  // Veldspar Processing III
   * }, myReprocessingStructure);
   */
  reprocessMaterials(
    reprocessingSkillsMap = {},
    reprocessingStructure = structureFromDocument(
      undefined,
      jobTypes.reprocessing,
    ),
  ) {
    const reprocessingLvl = reprocessingSkillsMap[reprocessingSkillTypeID] ?? 0;
    const reprocessingEffLvl =
      reprocessingSkillsMap[reprocessingEffSkillTypeID] ?? 0;
    const oreLvl = reprocessingSkillsMap[this.reprocessingSkill] ?? 0;

    const structureValue = structureBonusFor(
      reprocessingStructure,
      this.itemType,
    );

    const systemValue =
      getSystemTypeFromID(
        reprocessingStructure.jobType,
        reprocessingStructure.systemType,
      )?.value ?? 0;

    const rigValue = rigBonusFor(reprocessingStructure, this.itemType);
    const implantValue =
      getImplantFromID(
        reprocessingStructure.jobType,
        reprocessingStructure.implant,
      )?.value ?? 0;

    this.percentageYield = reprocessFromItemType(
      this.itemType,
      rigValue,
      systemValue,
      structureValue,
      reprocessingLvl,
      reprocessingEffLvl,
      oreLvl,
      implantValue,
    );

    for (let [id, value] of Object.entries(this.materials)) {
      this.reprocessedMaterials[id] = Math.round(
        this.itemType === reprocessingItemTypes.gas
          ? this.reprocessableQuantity * (this.percentageYield / 100)
          : value * (this.percentageYield / 100),
      );
    }
  }
}

export default ReprocessingItem;
