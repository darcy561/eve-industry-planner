import { jobTypes, reprocessingItemTypes } from "../Context/defaultValues";
import { getImplantFromID } from "../Functions/Industry Facilities/getStructureInfo";
import { reprocessFromItemType } from "../Functions/Reprocessing/reprocessingFormulas";
import {
  rigBonusFor,
  rigSecurityFor,
  structureBonusFor,
} from "../Functions/Reprocessing/reprocessingBonuses";
import { structureFromDocument } from "../Functions/Custom Structures/customStructure";

const reprocessingSkillTypeID = 3385;
const reprocessingEffSkillTypeID = 3389;

/**
 * ReprocessingItem class for EVE Online reprocessing calculations and management.
 *
 */
class ReprocessingItem {
  /**
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

    const rigValue = rigBonusFor(reprocessingStructure, this.itemType);
    const rigSecurity = rigSecurityFor(reprocessingStructure, this.itemType);
    const implantValue =
      getImplantFromID(
        reprocessingStructure.jobType,
        reprocessingStructure.implant,
      )?.value ?? 0;

    this.percentageYield = reprocessFromItemType(
      this.itemType,
      rigValue,
      rigSecurity,
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
